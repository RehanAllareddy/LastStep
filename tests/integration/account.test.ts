/** Account deletion, data export and phone verification. */
import { afterAll, describe, expect, it } from "vitest";
import {
  adminClient,
  captureSink,
  cleanupUsers,
  createSmsUser,
  createTestUser,
  futureForm,
  randomPhone,
  tinyPng,
  type Client,
} from "../support/supabase";
import { createAssignment } from "@/lib/assignments/service";
import { submitEvidence } from "@/lib/submissions/service";
import { deleteAccount } from "@/lib/account/deletion";
import { exportUserData } from "@/lib/account/export";
import { createSimulatedVerification } from "@/lib/notifications/simulated";
import { checkPhoneVerification, startPhoneVerification } from "@/lib/notifications/phone-verification";

const admin: Client = adminClient();
afterAll(() => cleanupUsers(admin));

describe("account deletion", () => {
  it("suppresses notifications first, then removes evidence and all user rows", async () => {
    const user = await createSmsUser(admin);
    const a = await createAssignment(admin, user.id, futureForm(), { dueAt: new Date(Date.now() + 3 * 86400_000) }, [
      "sms",
    ]);
    const b = await createAssignment(
      admin,
      user.id,
      futureForm({ title: "B" }),
      { dueAt: new Date(Date.now() + 3 * 86400_000) },
      ["sms"],
    );
    const sub = await submitEvidence(admin, user.id, b.id, await tinyPng(), true);
    const pendingJob = (
      await admin
        .from("reminder_jobs")
        .select("id")
        .eq("assignment_id", a.id)
        .eq("status", "scheduled")
        .limit(1)
        .single()
    ).data!;

    // Step 1 alone already makes any in-flight job unsendable.
    await admin.rpc("prepare_account_deletion", { p_user_id: user.id });
    await admin.from("reminder_jobs").update({ status: "processing" }).eq("id", pendingJob.id);
    expect((await admin.rpc("confirm_job_sendable", { p_job_id: pendingJob.id })).data).toBe(false);

    await deleteAccount(admin, user.id);
    expect((await admin.auth.admin.getUserById(user.id)).data.user).toBeNull();
    for (const table of [
      "assignments",
      "submissions",
      "reminder_jobs",
      "notification_consents",
      "contact_methods",
      "notification_preferences",
      "notification_events",
    ] as const) {
      expect((await admin.from(table).select("user_id").eq("user_id", user.id)).data, table).toEqual([]);
    }
    expect((await admin.from("profiles").select("id").eq("id", user.id)).data).toEqual([]);
    expect((await admin.storage.from("submissions").download(sub.submission.storage_path)).error).not.toBeNull();
  });

  it("exports the user's data without other users' data or secrets", async () => {
    const user = await createSmsUser(admin);
    const other = await createSmsUser(admin);
    await createAssignment(admin, user.id, futureForm(), { dueAt: new Date(Date.now() + 3 * 86400_000) }, ["sms"]);
    await createAssignment(
      admin,
      other.id,
      futureForm({ title: "Other" }),
      { dueAt: new Date(Date.now() + 3 * 86400_000) },
      ["sms"],
    );
    const out = await exportUserData(admin, user.id);
    expect(out.assignments).toHaveLength(1);
    expect(JSON.stringify(out)).not.toContain(other.id);
    expect(JSON.stringify(out)).not.toContain("value_hash");
    expect(out.notification_consents!.length).toBe(1);
  });
});

describe("phone verification", () => {
  it("verifies with the correct code, counts failed attempts, and never stores the code", async () => {
    const user = await createTestUser(admin);
    const cap = captureSink();
    const provider = createSimulatedVerification(cap.sink);
    const phone = randomPhone(); // per-number rate limits persist across runs
    await startPhoneVerification(admin, provider, user.id, `+1 (201) 555-${phone.slice(-4)}`);
    const code = /code is (\d{6})/.exec(cap.sent[0]!.body)![1]!;
    const row = (
      await admin
        .from("phone_verifications")
        .select("code_hash, phone_e164")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .single()
    ).data!;
    expect(row.phone_e164).toBe(phone);
    expect(row.code_hash).not.toContain(code);

    await expect(
      checkPhoneVerification(admin, provider, user.id, code === "000000" ? "111111" : "000000"),
    ).rejects.toMatchObject({ code: "wrong_code" });
    const contact = await checkPhoneVerification(admin, provider, user.id, code);
    expect(contact.verified_at).not.toBeNull();
    expect(contact.normalized_value).toBe(phone);
  });

  it("locks after too many wrong attempts and rejects invalid numbers", async () => {
    const user = await createTestUser(admin);
    const cap = captureSink();
    const provider = createSimulatedVerification(cap.sink);
    await expect(startPhoneVerification(admin, provider, user.id, "12345")).rejects.toMatchObject({
      code: "invalid_phone",
    });
    await startPhoneVerification(admin, provider, user.id, randomPhone());
    const code = /code is (\d{6})/.exec(cap.sent[0]!.body)![1]!;
    const wrong = code === "999999" ? "888888" : "999999";
    for (let i = 0; i < 5; i++)
      await expect(checkPhoneVerification(admin, provider, user.id, wrong)).rejects.toMatchObject({
        code: "wrong_code",
      });
    await expect(checkPhoneVerification(admin, provider, user.id, code)).rejects.toMatchObject({ code: "locked" });
  });

  it("rate-limits code requests per user", async () => {
    const user = await createTestUser(admin);
    const provider = createSimulatedVerification(captureSink().sink);
    for (let i = 0; i < 5; i++) await startPhoneVerification(admin, provider, user.id, randomPhone());
    await expect(startPhoneVerification(admin, provider, user.id, randomPhone())).rejects.toMatchObject({
      code: "rate_limited",
    });
  });

  it("changing numbers revokes consent tied to the old number", async () => {
    const user = await createSmsUser(admin);
    const cap = captureSink();
    const provider = createSimulatedVerification(cap.sink);
    await startPhoneVerification(admin, provider, user.id, randomPhone());
    await checkPhoneVerification(admin, provider, user.id, /code is (\d{6})/.exec(cap.sent[0]!.body)![1]!);
    const active = (
      await admin.from("notification_consents").select("id").eq("user_id", user.id).eq("consent_status", "granted")
    ).data!;
    expect(active).toEqual([]);
    expect(
      (await admin.from("contact_methods").select("id").eq("user_id", user.id).eq("is_active", true)).data,
    ).toHaveLength(1);
  });
});
