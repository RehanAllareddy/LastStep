/**
 * Scenario D (data layer): two users; every cross-user read/write is denied,
 * and users cannot bypass server workflows with direct writes.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  cleanupUsers,
  createSmsUser,
  futureForm,
  tinyPng,
  type Client,
  type TestUser,
} from "../support/supabase";
import { createAssignment } from "@/lib/assignments/service";
import { submitEvidence } from "@/lib/submissions/service";

const admin: Client = adminClient();
let a: TestUser & { phone: string };
let b: TestUser & { phone: string };
let aAssignment: string;
let aSubmissionPath: string;
let aSubmissionId: string;

beforeAll(async () => {
  a = await createSmsUser(admin);
  b = await createSmsUser(admin);
  const created = await createAssignment(admin, a.id, futureForm(), { dueAt: new Date(Date.now() + 3 * 86400_000) }, [
    "sms",
  ]);
  aAssignment = created.id;
  const second = await createAssignment(
    admin,
    a.id,
    futureForm({ title: "Second" }),
    { dueAt: new Date(Date.now() + 3 * 86400_000) },
    ["sms"],
  );
  const out = await submitEvidence(admin, a.id, second.id, await tinyPng(), true);
  aSubmissionPath = out.submission.storage_path;
  aSubmissionId = out.submission.id;
  await createAssignment(
    admin,
    b.id,
    futureForm({ title: "B's work" }),
    { dueAt: new Date(Date.now() + 3 * 86400_000) },
    ["sms"],
  );
});
afterAll(() => cleanupUsers(admin));

describe("row level security", () => {
  it("users read only their own rows", async () => {
    const own = await a.client.from("assignments").select("id, user_id");
    expect(own.data!.length).toBe(2);
    expect(own.data!.every((r) => r.user_id === a.id)).toBe(true);
    for (const table of [
      "assignments",
      "submissions",
      "reminder_jobs",
      "notification_events",
      "notification_consents",
      "notification_preferences",
      "assignment_events",
    ] as const) {
      const { data } = await b.client.from(table).select("user_id").eq("user_id", a.id);
      expect(data ?? [], table).toEqual([]);
    }
    expect((await b.client.from("profiles").select("id").eq("id", a.id)).data).toEqual([]);
    expect((await b.client.from("contact_methods").select("id, normalized_value").eq("user_id", a.id)).data).toEqual(
      [],
    );
  });

  it("users cannot modify another user's assignment", async () => {
    const res = await b.client.from("assignments").update({ title: "hacked" }).eq("id", aAssignment).select();
    expect(res.data ?? []).toEqual([]);
    const { data } = await admin.from("assignments").select("title").eq("id", aAssignment).single();
    expect(data!.title).toBe("Integration essay");
    const del = await b.client.from("assignments").delete().eq("id", aAssignment).select();
    expect(del.data ?? []).toEqual([]);
    expect((await admin.from("assignments").select("id").eq("id", aAssignment)).data).toHaveLength(1);
  });

  it("users cannot bypass the completion workflow with direct writes", async () => {
    const upd = await a.client.from("assignments").update({ status: "completed" }).eq("id", aAssignment);
    expect(upd.error?.code).toBe("42501");
    const ins = await a.client
      .from("submissions")
      .insert({
        assignment_id: aAssignment,
        user_id: a.id,
        storage_path: `${a.id}/x.webp`,
        mime_type: "image/webp",
        file_size_bytes: 1,
        status: "accepted",
      });
    expect(ins.error?.code).toBe("42501");
    const rpc = await a.client.rpc("create_submission", {
      p_user_id: a.id,
      p_assignment_id: aAssignment,
      p_submission_id: crypto.randomUUID(),
      p_storage_path: `${a.id}/${aAssignment}/x.webp`,
      p_mime_type: "image/webp",
      p_file_size_bytes: 1,
      p_width: 1,
      p_height: 1,
      p_self_attested: true,
    });
    expect(rpc.error?.code).toBe("42501");
  });

  it("users cannot grant themselves consent or create reminder jobs", async () => {
    const consent = await b.client
      .from("notification_consents")
      .insert({ user_id: b.id, category: "voice_reminders", agreement_version: "x", consent_source: "settings" });
    expect(consent.error?.code).toBe("42501");
    const rpc = await b.client.rpc("record_consent", {
      p_user_id: b.id,
      p_category: "voice_reminders",
      p_grant: true,
      p_agreement_version: "x",
      p_source: "settings",
    });
    expect(rpc.error?.code).toBe("42501");
    const job = await b.client
      .from("reminder_jobs")
      .insert({
        assignment_id: aAssignment,
        user_id: b.id,
        channel: "sms",
        kind: "follow_up",
        scheduled_at: new Date().toISOString(),
        original_scheduled_at: new Date().toISOString(),
        occurrence_key: "x",
        schedule_version: 1,
      });
    expect(job.error?.code).toBe("42501");
    const prefs = await b.client
      .from("notification_preferences")
      .update({ max_daily_notifications: 12 })
      .eq("user_id", b.id);
    expect(prefs.error?.code).toBe("42501");
  });

  it("service-only tables and privileged functions are not reachable", async () => {
    for (const table of [
      "webhook_events",
      "phone_suppressions",
      "app_admins",
      "admin_audit_log",
      "system_settings",
      "dev_outbox",
      "phone_verifications",
      "rate_limit_hits",
    ] as const) {
      const { data, error } = await a.client.from(table).select("*").limit(1);
      expect(error?.code === "42501" || (data ?? []).length === 0, table).toBe(true);
    }
    expect((await a.client.from("contact_methods").select("value_hash")).error?.code).toBe("42501");
    expect((await a.client.rpc("claim_due_reminder_jobs", { p_limit: 10 })).error?.code).toBe("42501");
    expect((await a.client.rpc("admin_metrics")).error?.code).toBe("42501");
    const anon = (await import("@supabase/supabase-js")).createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
    expect((await anon.from("assignments").select("id")).data ?? []).toEqual([]);
  });

  it("profile updates are limited to the owner's safe columns", async () => {
    expect((await a.client.from("profiles").update({ display_name: "Renamed" }).eq("id", a.id)).error).toBeNull();
    expect((await a.client.from("profiles").update({ onboarding_completed: false }).eq("id", a.id)).error?.code).toBe(
      "42501",
    );
    const other = await a.client.from("profiles").update({ display_name: "x" }).eq("id", b.id).select();
    expect(other.data ?? []).toEqual([]);
  });

  it("storage evidence is private to its owner", async () => {
    expect((await a.client.storage.from("submissions").download(aSubmissionPath)).error).toBeNull();
    expect((await b.client.storage.from("submissions").download(aSubmissionPath)).error).not.toBeNull();
    expect((await b.client.storage.from("submissions").list(a.id)).data ?? []).toEqual([]);
    const upload = await b.client.storage
      .from("submissions")
      .upload(`${b.id}/x/y.webp`, Buffer.from("x"), { contentType: "image/webp" });
    expect(upload.error).not.toBeNull();
    // Owner reads their own submission row; the other user cannot see it.
    expect((await a.client.from("submissions").select("id").eq("id", aSubmissionId)).data).toHaveLength(1);
    expect((await b.client.from("submissions").select("id").eq("id", aSubmissionId)).data).toEqual([]);
  });
});
