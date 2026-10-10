import { describe, expect, it } from "vitest";
import { parseKeyword } from "@/lib/notifications/keywords";
import { renderCompletionSms, renderSms, sanitizeTitle } from "@/lib/notifications/messages";
import { computeProgress } from "@/lib/assignments/progress";
import { relativeDeadline } from "@/lib/format";
import { resolveDeadline } from "@/lib/assignments/service";
import type { AssignmentFormValues } from "@/lib/validation/assignment";

describe("opt-out keywords", () => {
  it("recognizes carrier-standard keywords case-insensitively", () => {
    for (const w of ["STOP", "stop", " Unsubscribe ", "CANCEL", "end", "quit", "STOPALL"])
      expect(parseKeyword(w)).toBe("stop");
    for (const w of ["START", "unstop", "yes"]) expect(parseKeyword(w)).toBe("start");
    expect(parseKeyword("help")).toBe("help");
    expect(parseKeyword("please stop texting me")).toBeNull();
  });
  it("prefers Twilio's OptOutType when present", () => {
    expect(parseKeyword("arrêt", "STOP")).toBe("stop");
    expect(parseKeyword("hi", "START")).toBe("start");
  });
});

describe("messages", () => {
  it("is supportive, includes STOP instructions, and sanitizes titles", () => {
    const body = renderSms({
      kind: "follow_up",
      title: "Essay\n\nDraft",
      dueAt: new Date("2026-10-12T16:00:00Z"),
      timeZone: "UTC",
    });
    expect(body).toContain("'Essay Draft'");
    expect(body).toContain("Reply STOP");
    expect(sanitizeTitle("x".repeat(100))).toHaveLength(60);
    expect(renderCompletionSms("Essay")).toContain("reminders for this assignment have stopped");
  });
});

describe("progress metrics", () => {
  const now = new Date("2026-10-14T12:00:00Z"); // Wednesday
  const rows = [
    {
      status: "completed",
      due_at: "2026-10-13T00:00:00Z",
      submitted_at: "2026-10-12T20:00:00Z",
      completed_at: "2026-10-12T20:00:00Z",
    }, // on time, this week
    {
      status: "completed",
      due_at: "2026-10-01T00:00:00Z",
      submitted_at: "2026-10-02T00:00:00Z",
      completed_at: "2026-10-02T00:00:00Z",
    }, // late
    { status: "overdue", due_at: "2026-10-10T00:00:00Z", submitted_at: null, completed_at: null },
    { status: "active", due_at: "2026-10-20T00:00:00Z", submitted_at: null, completed_at: null }, // not yet decided
    { status: "canceled", due_at: "2026-10-01T00:00:00Z", submitted_at: null, completed_at: null }, // excluded
  ];
  it("computes transparent rates", () => {
    const s = computeProgress(rows, "UTC", now);
    expect(s.totalCompleted).toBe(2);
    expect(s.completedThisWeek).toBe(1);
    expect(s.completionRate).toBeCloseTo(2 / 3);
    expect(s.onTimeRate).toBe(0.5);
    expect(s.weekly).toHaveLength(8);
    expect(s.weekly.at(-1)!.completed).toBe(1);
  });
  it("returns null rates with no data instead of fake numbers", () => {
    const s = computeProgress([], "UTC", now);
    expect(s.completionRate).toBeNull();
    expect(s.onTimeRate).toBeNull();
  });
});

describe("deadlines", () => {
  const form = (over: Partial<AssignmentFormValues>): AssignmentFormValues => ({
    title: "t",
    description: "",
    subject: "",
    dueDate: "2026-10-20",
    dueTime: "23:59",
    timeZone: "America/New_York",
    priority: "normal",
    estimatedMinutes: "",
    reminderIntensity: "standard",
    channels: [],
    commitment: "",
    completionPolicy: "self_attested",
    recoveryDueDate: "",
    recoveryDueTime: "",
    ...over,
  });
  const now = new Date("2026-10-12T16:00:00Z");
  it("interprets the deadline in the chosen zone", () => {
    expect(resolveDeadline(form({}), now)).toEqual({ kind: "future", dueAt: new Date("2026-10-21T03:59:00Z") });
  });
  it("requires a recovery plan for past deadlines", () => {
    expect(resolveDeadline(form({ dueDate: "2026-10-10" }), now).kind).toBe("needs_recovery");
    const r = resolveDeadline(
      form({ dueDate: "2026-10-10", recoveryDueDate: "2026-10-13", recoveryDueTime: "18:00" }),
      now,
    );
    expect(r).toMatchObject({ kind: "recovery", dueAt: new Date("2026-10-13T22:00:00Z") });
    expect(
      resolveDeadline(form({ dueDate: "2026-10-10", recoveryDueDate: "2026-10-11", recoveryDueTime: "18:00" }), now)
        .kind,
    ).toBe("invalid");
  });
  it("labels relative time and overdue state", () => {
    expect(relativeDeadline("2026-10-12T19:30:00Z", now)).toMatchObject({ label: "3h 30m left", overdue: false });
    expect(relativeDeadline("2026-10-10T16:00:00Z", now)).toMatchObject({ label: "Overdue by 2d", overdue: true });
    expect(relativeDeadline("not-a-date", now)).toBeNull();
  });
});
