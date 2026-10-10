/** Scheduler dispatch against the real database (Scenarios C, E, F, G). */
import { afterAll, describe, expect, it } from "vitest";
import {
  adminClient,
  captureSink,
  cleanupUsers,
  createSmsUser,
  futureForm,
  makeDue,
  tinyPng,
  type Client,
} from "../support/supabase";
import { createAssignment } from "@/lib/assignments/service";
import { submitEvidence } from "@/lib/submissions/service";
import { createSimulatedProvider } from "@/lib/notifications/simulated";
import { createSupabaseReminderStore } from "@/lib/scheduler/store";
import { dispatchClaimedJob, triggerOccurrence, type DispatcherDeps } from "@/lib/scheduler/dispatcher";
import { ProviderError } from "@/lib/scheduler/retry";
import { SMS_AGREEMENT_VERSION } from "@/lib/consent/agreements";
import { rescheduleUserAssignments } from "@/lib/scheduler/sync";

const admin: Client = adminClient();
const store = createSupabaseReminderStore(admin, SMS_AGREEMENT_VERSION);
afterAll(() => cleanupUsers(admin));

async function setup() {
  const user = await createSmsUser(admin);
  const a = await createAssignment(admin, user.id, futureForm(), { dueAt: new Date(Date.now() + 3 * 86400_000) }, [
    "sms",
  ]);
  const { data } = await admin
    .from("reminder_jobs")
    .select("id")
    .eq("assignment_id", a.id)
    .eq("status", "scheduled")
    .order("scheduled_at")
    .limit(1)
    .single();
  await makeDue(admin, data!.id);
  return { user, assignment: a, jobId: data!.id };
}
const job = async (id: string) => (await admin.from("reminder_jobs").select("*").eq("id", id).single()).data!;
function deps(over: Partial<DispatcherDeps> = {}) {
  const cap = captureSink();
  return { cap, deps: { store, provider: createSimulatedProvider({ sink: cap.sink }), ...over } as DispatcherDeps };
}

describe("dispatch", () => {
  it("sends a due reminder once and records it", async () => {
    const { jobId, user } = await setup();
    const { cap, deps: d } = deps();
    expect(await triggerOccurrence(jobId, d)).toMatchObject({ outcome: "sent" });
    expect(cap.sent).toHaveLength(1);
    expect(cap.sent[0]!.body).toMatch(/^\[SIMULATED SMS\] LastStep/);
    expect(cap.sent[0]!.to_masked).not.toContain(user.phone.slice(2, 8));
    const j = await job(jobId);
    expect(j.status).toBe("sent");
    expect(j.simulated).toBe(true);
    expect(j.provider_message_id).toMatch(/^SIM-SM-/);
    const ev = (await admin.from("notification_events").select("event_type, metadata").eq("reminder_job_id", jobId))
      .data!;
    expect(ev.map((e) => e.event_type)).toEqual(["sent"]);
    expect(JSON.stringify(ev)).not.toContain(user.phone);
  });

  it("Scenario C: no SMS after consent is revoked, even for an already-due job", async () => {
    const { jobId, user } = await setup();
    // Re-schedule as due again after revocation would normally cancel it; force the race by
    // revoking then re-marking the job scheduled to prove the dispatch-time check holds.
    await admin.rpc("record_consent", {
      p_user_id: user.id,
      p_category: "sms_reminders",
      p_grant: false,
      p_agreement_version: SMS_AGREEMENT_VERSION,
      p_source: "settings",
    });
    expect((await job(jobId)).status).toBe("canceled");
    await admin
      .from("reminder_jobs")
      .update({ status: "scheduled", cancel_reason: null, canceled_at: null })
      .eq("id", jobId);
    const { cap, deps: d } = deps();
    expect(await triggerOccurrence(jobId, d)).toMatchObject({ outcome: "canceled", reason: "no_consent" });
    expect(cap.sent).toHaveLength(0);
    // Preferences alone never authorize messaging.
    await admin.from("notification_preferences").update({ sms_enabled: true }).eq("user_id", user.id);
    await admin.from("reminder_jobs").update({ status: "scheduled" }).eq("id", jobId);
    expect(await triggerOccurrence(jobId, d)).toMatchObject({ outcome: "canceled", reason: "no_consent" });
    expect(cap.sent).toHaveLength(0);
  });

  it("Scenario E: the same occurrence triggered many times dispatches exactly once", async () => {
    const { jobId } = await setup();
    const { cap, deps: d } = deps();
    const results = await Promise.all(Array.from({ length: 8 }, () => triggerOccurrence(jobId, d)));
    expect(results.filter((r) => r.outcome === "sent")).toHaveLength(1);
    expect(cap.sent).toHaveLength(1);
    // Batch claims racing each other also never double-claim.
    const { jobId: j2 } = await setup();
    const claims = await Promise.all(
      Array.from({ length: 5 }, () => admin.rpc("claim_due_reminder_jobs", { p_limit: 500 })),
    );
    const all = claims.flatMap((c) => c.data ?? []);
    expect(all.filter((id) => id === j2)).toHaveLength(1);
    await dispatchClaimedJob(j2, d);
    await dispatchClaimedJob(j2, d); // second call is a no-op
    expect(cap.sent).toHaveLength(2);
    // Re-inserting an identical occurrence key is rejected by the unique constraint.
    const dup = await job(jobId);
    const ins = await admin
      .from("reminder_jobs")
      .insert({
        assignment_id: dup.assignment_id,
        user_id: dup.user_id,
        channel: "sms",
        kind: dup.kind,
        scheduled_at: dup.scheduled_at,
        original_scheduled_at: dup.scheduled_at,
        occurrence_key: dup.occurrence_key,
        schedule_version: dup.schedule_version,
      });
    expect(ins.error?.code).toBe("23505");
  });

  it("Scenario F: a reminder due during quiet hours is deferred, not sent", async () => {
    const { jobId, user } = await setup();
    // Quiet window covering "now" in UTC.
    const now = new Date();
    const hh = (d: Date) => d.toISOString().slice(11, 16);
    await admin
      .from("notification_preferences")
      .update({
        time_zone: "UTC",
        quiet_hours_start: hh(new Date(now.getTime() - 3600_000)),
        quiet_hours_end: hh(new Date(now.getTime() + 3600_000)),
      })
      .eq("user_id", user.id);
    const { cap, deps: d } = deps();
    const r = await triggerOccurrence(jobId, d);
    expect(r).toMatchObject({ outcome: "deferred", reason: "quiet_hours" });
    expect(cap.sent).toHaveLength(0);
    const j = await job(jobId);
    expect(j.status).toBe("scheduled");
    expect(new Date(j.scheduled_at).getTime()).toBeGreaterThan(now.getTime() + 50 * 60_000);
    expect(j.attempt_count).toBe(0); // deferral is not a delivery attempt
  });

  it("Scenario G: provider outage is recorded, retried with backoff, capped, and never bypasses consent", async () => {
    const { jobId, user } = await setup();
    const down = () => new ProviderError("Service Unavailable", 503);
    const outage = deps({ provider: createSimulatedProvider({ sink: async () => undefined, failure: down }) });
    expect(await triggerOccurrence(jobId, outage.deps)).toMatchObject({
      outcome: "retry",
      category: "provider_unavailable",
    });
    let j = await job(jobId);
    expect(j.status).toBe("scheduled");
    expect(j.failure_category).toBe("provider_unavailable");
    expect(j.attempt_count).toBe(1);
    expect(new Date(j.scheduled_at).getTime()).toBeGreaterThan(Date.now() + 25_000);
    const ev = (await admin.from("notification_events").select("event_type").eq("reminder_job_id", jobId)).data!;
    expect(ev.map((e) => e.event_type)).toContain("retry");

    // Retrying early is impossible: the job isn't due yet.
    expect(await triggerOccurrence(jobId, outage.deps)).toMatchObject({ outcome: "not_claimed" });

    // Consent revoked between attempts: the retry must not send.
    await admin.rpc("record_consent", {
      p_user_id: user.id,
      p_category: "sms_reminders",
      p_grant: false,
      p_agreement_version: SMS_AGREEMENT_VERSION,
      p_source: "settings",
    });
    await admin
      .from("reminder_jobs")
      .update({ status: "scheduled", scheduled_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", jobId);
    const healthy = deps();
    expect(await triggerOccurrence(jobId, healthy.deps)).toMatchObject({ outcome: "canceled" });
    expect(healthy.cap.sent).toHaveLength(0);

    // Retries are capped at max_attempts, then dead-lettered.
    const second = await setup();
    for (let i = 0; i < 4; i++) {
      await makeDue(admin, second.jobId, 0);
      await triggerOccurrence(second.jobId, outage.deps);
    }
    j = await job(second.jobId);
    expect(j.status).toBe("failed");
    expect(j.failure_category).toBe("retry_exhausted:provider_unavailable");

    // A delivered/sent message is never re-sent by retries.
    const third = await setup();
    const ok = deps();
    await triggerOccurrence(third.jobId, ok.deps);
    await admin.from("reminder_jobs").update({ status: "delivered" }).eq("id", third.jobId);
    expect(await triggerOccurrence(third.jobId, ok.deps)).toMatchObject({ outcome: "not_claimed" });
    expect(ok.cap.sent).toHaveLength(1);
    // And admins can't requeue anything that reached the provider.
    const ops = await createSmsUser(admin);
    await admin.from("app_admins").insert({ user_id: ops.id, role: "ops" });
    expect((await admin.rpc("admin_retry_job", { p_admin_id: ops.id, p_job_id: third.jobId })).data).toBe(false);
  });

  it("ambiguous provider failures are dead-lettered, not retried", async () => {
    const { jobId } = await setup();
    const timeout = deps({
      provider: createSimulatedProvider({
        sink: async () => undefined,
        failure: () => new ProviderError("timeout", undefined, undefined, "ETIMEDOUT"),
      }),
    });
    expect(await triggerOccurrence(jobId, timeout.deps)).toMatchObject({
      outcome: "failed",
      category: "unknown_outcome",
    });
    expect((await job(jobId)).status).toBe("failed");
  });

  it("a submission racing a claimed job prevents the send", async () => {
    const { jobId, user, assignment } = await setup();
    expect((await admin.rpc("claim_reminder_job", { p_job_id: jobId })).data).toBe(true);
    await submitEvidence(admin, user.id, assignment.id, await tinyPng(), true); // cancels 'processing' too
    const { cap, deps: d } = deps();
    expect(await dispatchClaimedJob(jobId, d)).toMatchObject({ outcome: "not_claimed" });
    expect(cap.sent).toHaveLength(0);
  });

  it("re-granting consent revives canceled-but-never-sent reminders without duplicates", async () => {
    const { user, assignment } = await setup();
    const before = (
      await admin
        .from("reminder_jobs")
        .select("occurrence_key")
        .eq("assignment_id", assignment.id)
        .eq("status", "scheduled")
    ).data!.length;
    await admin.rpc("record_consent", {
      p_user_id: user.id,
      p_category: "sms_reminders",
      p_grant: false,
      p_agreement_version: SMS_AGREEMENT_VERSION,
      p_source: "settings",
    });
    await rescheduleUserAssignments(admin, user.id);
    expect(
      (await admin.from("reminder_jobs").select("id").eq("assignment_id", assignment.id).eq("status", "scheduled"))
        .data,
    ).toEqual([]);
    await admin.rpc("record_consent", {
      p_user_id: user.id,
      p_category: "sms_reminders",
      p_grant: true,
      p_agreement_version: SMS_AGREEMENT_VERSION,
      p_source: "settings",
    });
    await rescheduleUserAssignments(admin, user.id);
    const rows = (await admin.from("reminder_jobs").select("occurrence_key, status").eq("assignment_id", assignment.id))
      .data!;
    expect(rows.filter((r) => r.status === "scheduled").length).toBe(before);
    expect(new Set(rows.map((r) => r.occurrence_key)).size).toBe(rows.length);
  });

  it("marks past-due active assignments overdue", async () => {
    const { assignment } = await setup();
    await admin
      .from("assignments")
      .update({ due_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", assignment.id);
    await store.markOverdue();
    expect((await admin.from("assignments").select("status").eq("id", assignment.id).single()).data!.status).toBe(
      "overdue",
    );
  });
});
