/** Assignment CRUD, lifecycle and reminder job maintenance (incl. Scenario B). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, cleanupUsers, createSmsUser, createTestUser, futureForm, type Client } from "../support/supabase";
import { createAssignment, transitionAssignment, updateAssignment } from "@/lib/assignments/service";
import { AppError } from "@/lib/db/errors";

const admin: Client = adminClient();
let user: Awaited<ReturnType<typeof createSmsUser>>;
const jobs = async (id: string) =>
  (await admin.from("reminder_jobs").select("*").eq("assignment_id", id).order("scheduled_at")).data!;

beforeAll(async () => {
  user = await createSmsUser(admin);
});
afterAll(() => cleanupUsers(admin));

describe("assignments", () => {
  it("creates an assignment and schedules its reminder plan", async () => {
    const a = await createAssignment(admin, user.id, futureForm(), { dueAt: new Date(Date.now() + 4 * 86400_000) }, [
      "sms",
    ]);
    expect(a.status).toBe("active");
    const j = await jobs(a.id);
    expect(j.length).toBeGreaterThanOrEqual(3);
    expect(j.every((x) => x.status === "scheduled" && x.channel === "sms" && x.schedule_version === 1)).toBe(true);
    expect(new Set(j.map((x) => x.occurrence_key)).size).toBe(j.length);
    const events = (await admin.from("assignment_events").select("to_status").eq("assignment_id", a.id)).data!;
    expect(events.map((e) => e.to_status)).toEqual(["active"]);
  });

  it("Scenario B: changing the deadline cancels stale jobs and schedules new ones", async () => {
    const due1 = new Date(Date.now() + 3 * 86400_000);
    const a = await createAssignment(admin, user.id, futureForm(), { dueAt: due1 }, ["sms"]);
    const before = await jobs(a.id);
    expect(before.length).toBeGreaterThan(0);
    const due2 = new Date(Date.now() + 6 * 86400_000);
    const d = due2.toISOString();
    const updated = await updateAssignment(
      admin,
      user.id,
      a.id,
      futureForm({ dueDate: d.slice(0, 10), dueTime: d.slice(11, 16) }),
      due2,
      ["sms"],
    );
    expect(updated.schedule_version).toBe(2);
    const after = await jobs(a.id);
    const old = after.filter((x) => x.schedule_version === 1);
    const fresh = after.filter((x) => x.schedule_version === 2);
    expect(old.every((x) => x.status === "canceled" && x.cancel_reason === "rescheduled")).toBe(true);
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.every((x) => x.status === "scheduled")).toBe(true);
    expect(
      fresh.some(
        (x) =>
          x.kind === "due_now" && new Date(x.scheduled_at).getTime() === Math.floor(due2.getTime() / 60000) * 60000,
      ),
    ).toBe(true);
  });

  it("pause cancels pending reminders; resume reschedules; cancel stops everything", async () => {
    const a = await createAssignment(admin, user.id, futureForm(), { dueAt: new Date(Date.now() + 4 * 86400_000) }, [
      "sms",
    ]);
    const paused = await transitionAssignment(admin, user.id, a.id, "pause");
    expect(paused.status).toBe("paused");
    expect((await jobs(a.id)).every((x) => x.status === "canceled")).toBe(true);
    const resumed = await transitionAssignment(admin, user.id, a.id, "resume");
    expect(resumed.status).toBe("active");
    expect(
      (await jobs(a.id)).some((x) => x.status === "scheduled" && x.schedule_version === resumed.schedule_version),
    ).toBe(true);
    await transitionAssignment(admin, user.id, a.id, "cancel");
    expect((await jobs(a.id)).filter((x) => x.status === "scheduled")).toEqual([]);
    await expect(transitionAssignment(admin, user.id, a.id, "resume")).rejects.toMatchObject({
      code: "invalid_transition",
    });
  });

  it("refuses edits by other users and invalid transitions at the database level", async () => {
    const other = await createTestUser(admin);
    const a = await createAssignment(admin, user.id, futureForm(), { dueAt: new Date(Date.now() + 4 * 86400_000) }, [
      "sms",
    ]);
    await expect(transitionAssignment(admin, other.id, a.id, "cancel")).rejects.toBeInstanceOf(AppError);
    const direct = await admin.from("assignments").update({ status: "completed" }).eq("id", a.id);
    expect(direct.error?.message).toContain("invalid assignment transition");
  });

  it("caps reminder jobs regardless of what a caller submits", async () => {
    const a = await createAssignment(
      admin,
      user.id,
      futureForm({ channels: [] }),
      { dueAt: new Date(Date.now() + 30 * 86400_000) },
      [],
    );
    const flood = Array.from({ length: 100 }, (_, i) => ({
      channel: "sms",
      kind: "follow_up",
      scheduled_at: new Date(Date.now() + (i + 1) * 3600_000).toISOString(),
      occurrence_key: `${a.id}:${a.schedule_version}:sms:follow_up:${i}`,
    }));
    const res = await admin.rpc("sync_reminder_jobs", {
      p_assignment_id: a.id,
      p_schedule_version: a.schedule_version,
      p_jobs: flood,
    });
    expect((res.data as { inserted: number }).inserted).toBe(12);
    const again = await admin.rpc("sync_reminder_jobs", {
      p_assignment_id: a.id,
      p_schedule_version: a.schedule_version,
      p_jobs: flood,
    });
    expect((again.data as { inserted: number }).inserted).toBe(0); // idempotent
    const stale = await admin.rpc("sync_reminder_jobs", {
      p_assignment_id: a.id,
      p_schedule_version: a.schedule_version - 1,
      p_jobs: flood,
    });
    expect((stale.data as { status: string }).status).toBe("stale");
  });

  it("schedules no jobs without consent", async () => {
    const noConsent = await createTestUser(admin);
    // Even if a caller passes "sms" through, the planner requires consent + a verified phone.
    const a = await createAssignment(
      admin,
      noConsent.id,
      futureForm(),
      { dueAt: new Date(Date.now() + 4 * 86400_000) },
      ["sms"],
    );
    expect(await jobs(a.id)).toEqual([]);
  });
});
