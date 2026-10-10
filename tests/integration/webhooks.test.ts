/** Twilio webhooks through the real route handlers with real signature validation. */
import { afterAll, describe, expect, it } from "vitest";
import twilio from "twilio";
import {
  adminClient,
  captureSink,
  cleanupUsers,
  createSmsUser,
  futureForm,
  makeDue,
  type Client,
} from "../support/supabase";
import { createAssignment } from "@/lib/assignments/service";
import { createSupabaseReminderStore } from "@/lib/scheduler/store";
import { triggerOccurrence } from "@/lib/scheduler/dispatcher";
import { createSimulatedProvider } from "@/lib/notifications/simulated";
import { SMS_AGREEMENT_VERSION } from "@/lib/consent/agreements";
import { phoneHash } from "@/lib/security/phone";
import { POST as inbound } from "@/app/api/webhooks/twilio/inbound/route";
import { POST as status } from "@/app/api/webhooks/twilio/status/route";

const admin: Client = adminClient();
afterAll(() => cleanupUsers(admin));

function signed(path: string, params: Record<string, string>, opts: { badSignature?: boolean } = {}) {
  const url = new URL(path, process.env.NEXT_PUBLIC_APP_URL).toString();
  const sig = twilio.getExpectedTwilioSignature(process.env.TWILIO_AUTH_TOKEN!, url, params);
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": opts.badSignature ? `${sig}x` : sig,
    },
    body: new URLSearchParams(params).toString(),
  });
}
const sid = () => `SM${crypto.randomUUID().replace(/-/g, "")}`;

async function setup() {
  const user = await createSmsUser(admin);
  const a = await createAssignment(admin, user.id, futureForm(), { dueAt: new Date(Date.now() + 3 * 86400_000) }, [
    "sms",
  ]);
  return { user, a };
}

describe("inbound SMS webhook", () => {
  it("rejects requests with an invalid signature", async () => {
    const { user } = await setup();
    const res = await inbound(
      signed(
        "/api/webhooks/twilio/inbound",
        { MessageSid: sid(), From: user.phone, Body: "STOP" },
        { badSignature: true },
      ),
    );
    expect(res.status).toBe(403);
    expect(
      (await admin.from("phone_suppressions").select("phone_hash").eq("phone_hash", phoneHash(user.phone))).data,
    ).toEqual([]);
  });

  it("STOP suppresses the number, revokes consent, cancels jobs, and blocks dispatch", async () => {
    const { user, a } = await setup();
    const res = await inbound(
      signed("/api/webhooks/twilio/inbound", { MessageSid: sid(), From: user.phone, Body: "Stop" }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/xml");
    expect(await res.text()).toContain("<Response></Response>");

    expect(
      (await admin.from("phone_suppressions").select("lifted_at").eq("phone_hash", phoneHash(user.phone)).single())
        .data!.lifted_at,
    ).toBeNull();
    const consents = (
      await admin.from("notification_consents").select("consent_status, revocation_source").eq("user_id", user.id)
    ).data!;
    expect(consents.every((c) => c.consent_status === "revoked" && c.revocation_source === "inbound_stop")).toBe(true);
    const jobs = (await admin.from("reminder_jobs").select("id, status").eq("assignment_id", a.id)).data!;
    expect(jobs.every((j) => j.status === "canceled")).toBe(true);
    const prefs = (await admin.from("notification_preferences").select("sms_enabled").eq("user_id", user.id).single())
      .data!;
    expect(prefs.sms_enabled).toBe(false);

    // Even an application-level retry of an old job can't send: suppression + consent both block it.
    await admin.from("reminder_jobs").update({ status: "scheduled" }).eq("id", jobs[0]!.id);
    await makeDue(admin, jobs[0]!.id);
    const cap = captureSink();
    const r = await triggerOccurrence(jobs[0]!.id, {
      store: createSupabaseReminderStore(admin, SMS_AGREEMENT_VERSION),
      provider: createSimulatedProvider({ sink: cap.sink }),
    });
    expect(r.outcome).toBe("canceled");
    expect(cap.sent).toHaveLength(0);

    // Granting consent through the app is refused while the number is opted out at the carrier.
    const grant = await admin.rpc("record_consent", {
      p_user_id: user.id,
      p_category: "sms_reminders",
      p_grant: true,
      p_agreement_version: SMS_AGREEMENT_VERSION,
      p_source: "settings",
    });
    expect(grant.error?.message).toBe("phone_opted_out");
  });

  it("processes a duplicate delivery of the same message only once", async () => {
    const { user } = await setup();
    const id = sid();
    await inbound(signed("/api/webhooks/twilio/inbound", { MessageSid: id, From: user.phone, Body: "STOP" }));
    await inbound(signed("/api/webhooks/twilio/inbound", { MessageSid: id, From: user.phone, Body: "STOP" }));
    const rows = (
      await admin.from("webhook_events").select("processing_status").eq("provider_event_id", `inbound:${id}`)
    ).data!;
    expect(rows).toEqual([{ processing_status: "processed" }]);
    const optOuts = (
      await admin.from("notification_events").select("id").eq("user_id", user.id).eq("event_type", "opt_out")
    ).data!;
    expect(optOuts).toHaveLength(1);
  });

  it("START lifts suppression and resubscribes SMS, rescheduling reminders", async () => {
    const { user, a } = await setup();
    await inbound(signed("/api/webhooks/twilio/inbound", { MessageSid: sid(), From: user.phone, Body: "STOP" }));
    await inbound(signed("/api/webhooks/twilio/inbound", { MessageSid: sid(), From: user.phone, Body: "START" }));
    expect(
      (await admin.from("phone_suppressions").select("lifted_at").eq("phone_hash", phoneHash(user.phone)).single())
        .data!.lifted_at,
    ).not.toBeNull();
    const active = (
      await admin
        .from("notification_consents")
        .select("consent_source")
        .eq("user_id", user.id)
        .eq("consent_status", "granted")
    ).data!;
    expect(active).toEqual([{ consent_source: "inbound_start" }]);
    expect(
      (await admin.from("reminder_jobs").select("id").eq("assignment_id", a.id).eq("status", "scheduled")).data!.length,
    ).toBeGreaterThan(0);
  });

  it("ignores non-keyword messages and unknown numbers", async () => {
    const res = await inbound(
      signed("/api/webhooks/twilio/inbound", { MessageSid: sid(), From: "+12015550199", Body: "thanks!" }),
    );
    expect(res.status).toBe(200);
  });
});

describe("delivery status webhook", () => {
  it("reconciles sent -> delivered and never moves backwards", async () => {
    const { a } = await setup();
    const job = (
      await admin
        .from("reminder_jobs")
        .select("id")
        .eq("assignment_id", a.id)
        .eq("status", "scheduled")
        .limit(1)
        .single()
    ).data!;
    await makeDue(admin, job.id);
    const r = await triggerOccurrence(job.id, {
      store: createSupabaseReminderStore(admin, SMS_AGREEMENT_VERSION),
      provider: createSimulatedProvider({ sink: async () => undefined }),
    });
    const msgId = (r as { providerMessageId: string }).providerMessageId;
    expect(
      (await status(signed("/api/webhooks/twilio/status", { MessageSid: msgId, MessageStatus: "delivered" }))).status,
    ).toBe(204);
    expect(
      (await admin.from("reminder_jobs").select("status, delivered_at").eq("id", job.id).single()).data!.status,
    ).toBe("delivered");
    await status(signed("/api/webhooks/twilio/status", { MessageSid: msgId, MessageStatus: "sent" }));
    expect((await admin.from("reminder_jobs").select("status").eq("id", job.id).single()).data!.status).toBe(
      "delivered",
    );
    expect(
      (
        await status(
          signed(
            "/api/webhooks/twilio/status",
            { MessageSid: msgId, MessageStatus: "delivered" },
            { badSignature: true },
          ),
        )
      ).status,
    ).toBe(403);
  });

  it("carrier opt-out error 21610 suppresses the number", async () => {
    const { user } = await setup();
    await status(
      signed("/api/webhooks/twilio/status", {
        MessageSid: sid(),
        MessageStatus: "undelivered",
        ErrorCode: "21610",
        To: user.phone,
      }),
    );
    expect(
      (await admin.from("phone_suppressions").select("reason").eq("phone_hash", phoneHash(user.phone)).single()).data!
        .reason,
    ).toBe("stop");
  });
});
