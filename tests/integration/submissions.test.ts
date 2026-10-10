/** Scenario A (backend): upload -> submission -> completion -> reminders canceled. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  cleanupUsers,
  createSmsUser,
  createTestUser,
  futureForm,
  tinyPng,
  type Client,
} from "../support/supabase";
import { createAssignment } from "@/lib/assignments/service";
import { deleteEvidence, submitEvidence } from "@/lib/submissions/service";
import { rescheduleAssignment } from "@/lib/scheduler/sync";

const admin: Client = adminClient();
let user: Awaited<ReturnType<typeof createSmsUser>>;
beforeAll(async () => {
  user = await createSmsUser(admin);
});
afterAll(() => cleanupUsers(admin));
const due = () => ({ dueAt: new Date(Date.now() + 3 * 86400_000) });

describe("submissions", () => {
  it("self-attested submission completes the assignment and cancels pending reminders", async () => {
    const a = await createAssignment(admin, user.id, futureForm(), due(), ["sms"]);
    const pending = (await admin.from("reminder_jobs").select("id").eq("assignment_id", a.id).eq("status", "scheduled"))
      .data!;
    expect(pending.length).toBeGreaterThan(0);
    const out = await submitEvidence(admin, user.id, a.id, await tinyPng(), true);
    expect(out.assignment.status).toBe("completed");
    expect(out.submission.status).toBe("accepted");
    expect(out.submission.mime_type).toBe("image/webp");
    expect(out.canceledJobs).toBe(pending.length);
    const jobs = (await admin.from("reminder_jobs").select("status, cancel_reason").eq("assignment_id", a.id)).data!;
    expect(jobs.every((j) => j.status === "canceled" && j.cancel_reason === "submitted")).toBe(true);
    const events = (
      await admin.from("assignment_events").select("to_status").eq("assignment_id", a.id).order("created_at")
    ).data!.map((e) => e.to_status);
    expect(events).toEqual(["active", "submitted", "completed"]);
    const file = await admin.storage.from("submissions").download(out.submission.storage_path);
    expect(file.error).toBeNull();
    // Re-sync after completion must not resurrect reminders.
    await rescheduleAssignment(admin, a.id);
    expect(
      (await admin.from("reminder_jobs").select("id").eq("assignment_id", a.id).eq("status", "scheduled")).data,
    ).toEqual([]);
  });

  it("rejects a second submission and does not orphan the uploaded object", async () => {
    const a = await createAssignment(admin, user.id, futureForm(), due(), ["sms"]);
    await submitEvidence(admin, user.id, a.id, await tinyPng(), true);
    await expect(submitEvidence(admin, user.id, a.id, await tinyPng(), true)).rejects.toMatchObject({
      code: "not_submittable",
    });
    const listed = (await admin.storage.from("submissions").list(`${user.id}/${a.id}`)).data!;
    expect(listed).toHaveLength(1);
  });

  it("concurrent double-submits produce exactly one submission", async () => {
    const a = await createAssignment(admin, user.id, futureForm(), due(), ["sms"]);
    const png = await tinyPng();
    const results = await Promise.allSettled([1, 2, 3].map(() => submitEvidence(admin, user.id, a.id, png, true)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await admin.from("submissions").select("id").eq("assignment_id", a.id)).data).toHaveLength(1);
  });

  it("requires attestation for self-attested policy and rejects non-image content", async () => {
    const a = await createAssignment(admin, user.id, futureForm(), due(), ["sms"]);
    await expect(submitEvidence(admin, user.id, a.id, await tinyPng(), false)).rejects.toMatchObject({
      code: "attestation_required",
    });
    await expect(
      submitEvidence(admin, user.id, a.id, Buffer.from("<script>alert(1)</script>"), true),
    ).rejects.toMatchObject({ code: "image_unsupported_type" });
    expect((await admin.from("assignments").select("status").eq("id", a.id).single()).data!.status).toBe("active");
  });

  it("refuses uploads to another user's assignment", async () => {
    const other = await createTestUser(admin);
    const a = await createAssignment(admin, user.id, futureForm(), due(), ["sms"]);
    await expect(submitEvidence(admin, other.id, a.id, await tinyPng(), true)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("review-required: under_review pauses reminders; rejection reopens and reschedules", async () => {
    const a = await createAssignment(admin, user.id, futureForm({ completionPolicy: "review_required" }), due(), [
      "sms",
    ]);
    const out = await submitEvidence(admin, user.id, a.id, await tinyPng(), false);
    expect(out.assignment.status).toBe("under_review");
    expect(out.submission.status).toBe("pending_review");
    expect(
      (await admin.from("reminder_jobs").select("id").eq("assignment_id", a.id).eq("status", "scheduled")).data,
    ).toEqual([]);

    // Non-reviewers can't review.
    expect(
      (
        await admin.rpc("review_submission", {
          p_reviewer_id: user.id,
          p_submission_id: out.submission.id,
          p_decision: "accept",
        })
      ).error?.message,
    ).toBe("forbidden");
    const reviewer = await createTestUser(admin);
    await admin.from("app_admins").insert({ user_id: reviewer.id, role: "reviewer" });
    const rejected = await admin.rpc("review_submission", {
      p_reviewer_id: reviewer.id,
      p_submission_id: out.submission.id,
      p_decision: "reject",
      p_note: "Screenshot is blank",
    });
    expect((rejected.data as { assignment: { status: string } }).assignment.status).toBe("active");
    await rescheduleAssignment(admin, a.id);
    expect(
      (await admin.from("reminder_jobs").select("id").eq("assignment_id", a.id).eq("status", "scheduled")).data!.length,
    ).toBeGreaterThan(0);
    expect(
      (await admin.from("admin_audit_log").select("action").eq("actor_id", reviewer.id)).data!.map((r) => r.action),
    ).toContain("submission.reject");
  });

  it("lets the owner delete evidence", async () => {
    const a = await createAssignment(admin, user.id, futureForm(), due(), ["sms"]);
    const out = await submitEvidence(admin, user.id, a.id, await tinyPng(), true);
    await deleteEvidence(admin, user.id, out.submission.id);
    expect((await admin.storage.from("submissions").download(out.submission.storage_path)).error).not.toBeNull();
    expect(
      (await admin.from("submissions").select("deleted_at").eq("id", out.submission.id).single()).data!.deleted_at,
    ).not.toBeNull();
  });
});
