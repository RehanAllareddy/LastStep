import { describe, expect, it } from "vitest";
import { computeReminderPlan, type PlanInput } from "@/lib/scheduler/plan";
import { DEFAULT_LIMITS } from "@/lib/scheduler/policy";

const NOW = new Date("2026-10-12T14:00:00Z"); // Mon 10:00 EDT
const base = (over: Partial<PlanInput> = {}): PlanInput => ({
  assignmentId: "a1",
  scheduleVersion: 1,
  now: NOW,
  dueAt: new Date("2026-10-15T19:00:00Z"), // Thu 15:00 EDT
  intensity: "standard",
  channels: ["sms"],
  eligibleChannels: { sms: true, voice: false },
  quiet: { start: "21:30", end: "08:00", timeZone: "America/New_York" },
  overrides: { voiceCallLeadMinutes: 60 },
  limits: DEFAULT_LIMITS,
  ...over,
});

describe("computeReminderPlan", () => {
  it("builds the standard plan: lead times, due now, overdue follow-ups", () => {
    const plan = computeReminderPlan(base());
    const kinds = plan.map((p) => `${p.kind}@${p.scheduledAt.toISOString()}`);
    expect(kinds).toContain("before_deadline@2026-10-14T19:00:00.000Z"); // 24h before
    expect(kinds).toContain("before_deadline@2026-10-15T16:00:00.000Z"); // 3h before
    expect(kinds).toContain("due_now@2026-10-15T19:00:00.000Z");
    expect(kinds).toContain("overdue@2026-10-16T12:00:00.000Z"); // +12h = 03:00 EDT (quiet) -> moved to 08:00 EDT
    expect(plan.every((p) => p.channel === "sms")).toBe(true);
  });

  it("never schedules inside quiet hours", () => {
    const plan = computeReminderPlan(base({ intensity: "intensive", dueAt: new Date("2026-10-16T03:59:00Z") })); // 23:59 EDT
    for (const p of plan) {
      const h = Number(
        new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(
          p.scheduledAt,
        ),
      );
      const m = p.scheduledAt.getUTCMinutes();
      const minutes = h * 60 + m;
      expect(minutes >= 21 * 60 + 30 || minutes < 8 * 60).toBe(false);
    }
  });

  it("moves a due-time reminder in quiet hours earlier and relabels it", () => {
    const plan = computeReminderPlan(base({ dueAt: new Date("2026-10-16T03:59:00Z") })); // 23:59 EDT
    expect(plan.some((p) => p.kind === "due_now")).toBe(false);
    expect(
      plan.some((p) => p.kind === "before_deadline" && p.scheduledAt.toISOString() === "2026-10-16T01:15:00.000Z"),
    ).toBe(true); // 21:15 EDT
  });

  it("drops past times and returns nothing when no channel is eligible", () => {
    expect(computeReminderPlan(base({ eligibleChannels: { sms: false, voice: false } }))).toEqual([]);
    expect(computeReminderPlan(base({ channels: [] }))).toEqual([]);
    const plan = computeReminderPlan(base({ dueAt: new Date(NOW.getTime() + 30 * 60_000) }));
    expect(plan.every((p) => p.scheduledAt.getTime() > NOW.getTime())).toBe(true);
  });

  it("enforces the per-assignment cap and minimum gap", () => {
    const plan = computeReminderPlan(
      base({
        intensity: "intensive",
        dueAt: new Date("2026-10-25T19:00:00Z"),
        limits: { ...DEFAULT_LIMITS, maxRemindersPerAssignment: 5 },
      }),
    );
    expect(plan.length).toBe(5);
    const times = plan.map((p) => p.scheduledAt.getTime()).sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++)
      expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(DEFAULT_LIMITS.minGapMinutes * 60_000);
    expect(plan.some((p) => p.kind === "due_now")).toBe(true); // highest priority survives the cap
  });

  it("produces deterministic, version-scoped occurrence keys", () => {
    const a = computeReminderPlan(base());
    const b = computeReminderPlan(base());
    expect(a.map((p) => p.occurrenceKey)).toEqual(b.map((p) => p.occurrenceKey));
    expect(new Set(a.map((p) => p.occurrenceKey)).size).toBe(a.length);
    expect(a.every((p) => p.occurrenceKey.startsWith("a1:1:sms:"))).toBe(true);
    const v2 = computeReminderPlan(base({ scheduleVersion: 2 }));
    expect(v2.every((p) => p.occurrenceKey.startsWith("a1:2:"))).toBe(true);
  });

  it("adds at most one voice call when consented, outside quiet hours", () => {
    const plan = computeReminderPlan(
      base({ channels: ["sms", "voice"], eligibleChannels: { sms: true, voice: true } }),
    );
    const calls = plan.filter((p) => p.channel === "voice");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.scheduledAt.toISOString()).toBe("2026-10-15T18:00:00.000Z");
  });

  it("honors user overrides", () => {
    const plan = computeReminderPlan(
      base({ intensity: "gentle", overrides: { firstReminderLeadHours: 48, voiceCallLeadMinutes: 60 } }),
    );
    expect(
      plan.some((p) => p.kind === "before_deadline" && p.scheduledAt.toISOString() === "2026-10-13T19:00:00.000Z"),
    ).toBe(true);
  });
});
