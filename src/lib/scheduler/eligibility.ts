import { isWithinQuietHours, quietPeriodEnd } from "@/lib/time/quiet-hours";
import { limitsFromSettings, type Channel, type ReminderKind } from "./policy";

/** Shape returned by public.get_dispatch_context(). */
export interface DispatchContext {
  job: {
    id: string;
    assignment_id: string;
    user_id: string;
    channel: Channel;
    kind: ReminderKind;
    status: string;
    scheduled_at: string;
    original_scheduled_at: string;
    attempt_count: number;
    max_attempts: number;
    schedule_version: number;
  };
  assignment: {
    id: string;
    title: string;
    status: string;
    due_at: string;
    time_zone: string;
    channels: Channel[];
    schedule_version: number;
  } | null;
  account_active: boolean;
  preferences: {
    sms_enabled: boolean;
    voice_calls_enabled: boolean;
    quiet_hours_start: string;
    quiet_hours_end: string;
    time_zone: string;
    max_daily_notifications: number;
  } | null;
  contact: { id: string; phone: string; phone_hash: string; verified: boolean } | null;
  consent: { sms: boolean; voice: boolean };
  suppressed: boolean;
  sent_today: number;
  voice_today: number;
  last_sent_for_assignment: string | null;
  limits: unknown;
}

export type DispatchDecision =
  | { action: "send" }
  | { action: "cancel"; reason: string }
  | { action: "skip"; reason: string }
  | { action: "defer"; until: Date; reason: string };

export interface EligibilityOptions {
  voiceConfigured: boolean;
}

/** Reminders more than this late (e.g. after an outage) are skipped, not sent. */
export const STALE_AFTER_MS = 6 * 60 * 60_000;
/** Quiet-hour deferrals are only kept if they land within this window of the original time. */
export const MAX_DEFERRAL_MS = 12 * 60 * 60_000;

/**
 * Decides what to do with a claimed reminder immediately before sending.
 * Pure: all state comes from the DispatchContext snapshot.
 */
export function evaluateDispatch(ctx: DispatchContext, now: Date, opts: EligibilityOptions): DispatchDecision {
  const { job, assignment, preferences: prefs, contact } = ctx;
  if (!assignment) return { action: "cancel", reason: "assignment_missing" };
  if (!ctx.account_active) return { action: "cancel", reason: "account_inactive" };
  if (job.schedule_version !== assignment.schedule_version) return { action: "cancel", reason: "stale_schedule" };
  if (assignment.status !== "active" && assignment.status !== "overdue") {
    return { action: "cancel", reason: `assignment_${assignment.status}` };
  }
  if (!assignment.channels.includes(job.channel)) return { action: "cancel", reason: "channel_not_selected" };

  // Consent is authoritative; preferences alone never authorize a message.
  if (!ctx.consent[job.channel]) return { action: "cancel", reason: "no_consent" };
  if (!prefs) return { action: "cancel", reason: "no_preferences" };
  if (job.channel === "sms" && !prefs.sms_enabled) return { action: "cancel", reason: "channel_disabled" };
  if (job.channel === "voice" && !prefs.voice_calls_enabled) return { action: "cancel", reason: "channel_disabled" };
  if (!contact || !contact.verified) return { action: "cancel", reason: "phone_not_verified" };
  if (ctx.suppressed) return { action: "cancel", reason: "suppressed" };
  if (job.channel === "voice" && !opts.voiceConfigured) return { action: "cancel", reason: "voice_unavailable" };

  const scheduled = new Date(job.scheduled_at).getTime();
  if (now.getTime() - scheduled > STALE_AFTER_MS) return { action: "skip", reason: "stale" };

  const quiet = { start: prefs.quiet_hours_start, end: prefs.quiet_hours_end, timeZone: prefs.time_zone };
  if (isWithinQuietHours(now, quiet)) {
    const end = quietPeriodEnd(now, quiet);
    const due = new Date(assignment.due_at).getTime();
    const preDeadline = job.kind !== "overdue";
    const original = new Date(job.original_scheduled_at).getTime();
    if ((preDeadline && end.getTime() > due) || end.getTime() - original > MAX_DEFERRAL_MS) {
      return { action: "skip", reason: "quiet_hours" };
    }
    return { action: "defer", until: end, reason: "quiet_hours" };
  }

  if (ctx.sent_today >= prefs.max_daily_notifications) return { action: "skip", reason: "daily_limit" };

  const limits = limitsFromSettings(ctx.limits);
  if (job.channel === "voice" && ctx.voice_today >= limits.maxVoiceCallsPerDay) {
    return { action: "skip", reason: "voice_daily_limit" };
  }
  if (ctx.last_sent_for_assignment) {
    const since = now.getTime() - new Date(ctx.last_sent_for_assignment).getTime();
    if (since < limits.minGapMinutes * 60_000) return { action: "skip", reason: "min_gap" };
  }
  return { action: "send" };
}
