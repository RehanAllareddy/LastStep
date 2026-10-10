import { describe, expect, it } from "vitest";
import { evaluateDispatch, type DispatchContext } from "@/lib/scheduler/eligibility";

const NOW = new Date("2026-10-12T16:00:00Z"); // 12:00 EDT
function ctx(over: Partial<DispatchContext> = {}, job: Partial<DispatchContext["job"]> = {}): DispatchContext {
  return {
    job: {
      id: "j",
      assignment_id: "a",
      user_id: "u",
      channel: "sms",
      kind: "before_deadline",
      status: "processing",
      scheduled_at: NOW.toISOString(),
      original_scheduled_at: NOW.toISOString(),
      attempt_count: 1,
      max_attempts: 4,
      schedule_version: 1,
      ...job,
    },
    assignment: {
      id: "a",
      title: "Essay",
      status: "active",
      due_at: "2026-10-13T16:00:00Z",
      time_zone: "America/New_York",
      channels: ["sms", "voice"],
      schedule_version: 1,
    },
    account_active: true,
    preferences: {
      sms_enabled: true,
      voice_calls_enabled: true,
      quiet_hours_start: "21:30",
      quiet_hours_end: "08:00",
      time_zone: "America/New_York",
      max_daily_notifications: 4,
    },
    contact: { id: "c", phone: "+15555550100", phone_hash: "h", verified: true },
    consent: { sms: true, voice: true },
    suppressed: false,
    sent_today: 0,
    voice_today: 0,
    last_sent_for_assignment: null,
    limits: { min_gap_minutes: 45, max_voice_calls_per_day: 1 },
    ...over,
  };
}
const opts = { voiceConfigured: true };

describe("evaluateDispatch", () => {
  it("sends when everything is eligible", () => {
    expect(evaluateDispatch(ctx(), NOW, opts)).toEqual({ action: "send" });
  });
  it("requires consent even when the preference is on", () => {
    expect(evaluateDispatch(ctx({ consent: { sms: false, voice: true } }), NOW, opts)).toEqual({
      action: "cancel",
      reason: "no_consent",
    });
  });
  it("cancels for terminal or paused assignments, stale schedules, deleted accounts", () => {
    expect(
      evaluateDispatch(ctx({ assignment: { ...ctx().assignment!, status: "completed" } }), NOW, opts),
    ).toMatchObject({ action: "cancel", reason: "assignment_completed" });
    expect(evaluateDispatch(ctx({ assignment: { ...ctx().assignment!, status: "paused" } }), NOW, opts)).toMatchObject({
      action: "cancel",
    });
    expect(evaluateDispatch(ctx({}, { schedule_version: 0 }), NOW, opts)).toMatchObject({ reason: "stale_schedule" });
    expect(evaluateDispatch(ctx({ account_active: false }), NOW, opts)).toMatchObject({ reason: "account_inactive" });
  });
  it("respects suppression, verification and disabled channels", () => {
    expect(evaluateDispatch(ctx({ suppressed: true }), NOW, opts)).toMatchObject({ reason: "suppressed" });
    expect(evaluateDispatch(ctx({ contact: { ...ctx().contact!, verified: false } }), NOW, opts)).toMatchObject({
      reason: "phone_not_verified",
    });
    expect(
      evaluateDispatch(ctx({ preferences: { ...ctx().preferences!, sms_enabled: false } }), NOW, opts),
    ).toMatchObject({ reason: "channel_disabled" });
    expect(evaluateDispatch(ctx({}, { channel: "voice" }), NOW, { voiceConfigured: false })).toMatchObject({
      reason: "voice_unavailable",
    });
  });
  it("defers to the end of quiet hours, or skips if that's past the deadline", () => {
    const late = new Date("2026-10-13T02:00:00Z"); // 22:00 EDT
    const d = evaluateDispatch(
      ctx({}, { scheduled_at: late.toISOString(), original_scheduled_at: late.toISOString() }),
      late,
      opts,
    );
    expect(d).toEqual({ action: "defer", until: new Date("2026-10-13T12:00:00Z"), reason: "quiet_hours" });
    const dueSoon = ctx(
      { assignment: { ...ctx().assignment!, due_at: "2026-10-13T03:00:00Z" } },
      { scheduled_at: late.toISOString(), original_scheduled_at: late.toISOString() },
    );
    expect(evaluateDispatch(dueSoon, late, opts)).toEqual({ action: "skip", reason: "quiet_hours" });
  });
  it("enforces daily limit, voice limit and minimum gap", () => {
    expect(evaluateDispatch(ctx({ sent_today: 4 }), NOW, opts)).toMatchObject({ reason: "daily_limit" });
    expect(evaluateDispatch(ctx({ voice_today: 1 }, { channel: "voice" }), NOW, opts)).toMatchObject({
      reason: "voice_daily_limit",
    });
    expect(
      evaluateDispatch(
        ctx({ last_sent_for_assignment: new Date(NOW.getTime() - 10 * 60_000).toISOString() }),
        NOW,
        opts,
      ),
    ).toMatchObject({ reason: "min_gap" });
  });
  it("skips reminders that are hours late instead of sending a burst", () => {
    const old = new Date(NOW.getTime() - 7 * 3600_000).toISOString();
    expect(evaluateDispatch(ctx({}, { scheduled_at: old }), NOW, opts)).toEqual({ action: "skip", reason: "stale" });
  });
});
