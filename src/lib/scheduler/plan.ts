import { isWithinQuietHours, quietPeriodEnd, quietPeriodStart, type QuietHours } from "@/lib/time/quiet-hours";
import {
  MAX_FOLLOW_UPS,
  resolvePreset,
  type Channel,
  type ReminderIntensity,
  type ReminderKind,
  type ReminderLimits,
  type UserReminderOverrides,
} from "./policy";

export interface PlanInput {
  assignmentId: string;
  scheduleVersion: number;
  now: Date;
  dueAt: Date;
  intensity: ReminderIntensity;
  /** Channels selected on the assignment. */
  channels: Channel[];
  /** Channels the user can currently receive (consent + enabled + verified phone). */
  eligibleChannels: Record<Channel, boolean>;
  quiet: QuietHours;
  overrides: UserReminderOverrides;
  limits: ReminderLimits;
}

export interface PlannedReminder {
  channel: Channel;
  kind: ReminderKind;
  scheduledAt: Date;
  occurrenceKey: string;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** Pre-deadline reminders landing in quiet hours move to this long before quiet hours begin. */
const QUIET_LEAD_BUFFER = 15 * MINUTE;
/** Don't schedule anything closer than this to "now". */
const MIN_LEAD = MINUTE;

const PRIORITY: Record<ReminderKind, number> = {
  due_now: 5,
  voice_call: 4,
  before_deadline: 3,
  overdue: 2,
  follow_up: 1,
};

interface Candidate {
  kind: ReminderKind;
  at: number;
  /** Priority of the original slot; survives relabeling by quiet-hour moves. */
  rank?: number;
}

const rankOf = (c: Candidate) => c.rank ?? PRIORITY[c.kind];

/**
 * Pure reminder planner. Produces the full set of future reminders for one
 * assignment and schedule version. Deterministic: the same input always
 * yields the same occurrence keys, so re-running sync is idempotent.
 */
export function computeReminderPlan(input: PlanInput): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  const now = input.now.getTime();
  const due = input.dueAt.getTime();
  const preset = resolvePreset(input.intensity, input.overrides);

  if (input.channels.includes("sms") && input.eligibleChannels.sms) {
    const candidates: Candidate[] = [];
    for (const h of preset.leadTimesHours) {
      candidates.push({ kind: "before_deadline", at: due - h * HOUR });
    }
    candidates.push({ kind: "due_now", at: due });
    for (let k = 1; k <= preset.overdueCount; k++) {
      candidates.push({ kind: "overdue", at: due + k * preset.overdueIntervalHours * HOUR });
    }
    if (preset.followUpIntervalHours) {
      const interval = preset.followUpIntervalHours * HOUR;
      const firstLead = (preset.leadTimesHours[0] ?? 0) * HOUR;
      const stopAt = due - firstLead - interval / 2;
      let count = 0;
      for (let t = now + interval; t < stopAt && count < MAX_FOLLOW_UPS; t += interval) {
        candidates.push({ kind: "follow_up", at: t });
        count++;
      }
    }
    const adjusted = candidates
      .map((c) => adjustForQuietHours(c, due, input.quiet))
      .filter((c): c is Candidate => c !== null)
      .filter((c) => c.at >= now + MIN_LEAD);
    for (const c of selectWithGap(
      adjusted,
      input.limits.minGapMinutes * MINUTE,
      input.limits.maxRemindersPerAssignment,
    )) {
      out.push(toPlanned(input, "sms", c));
    }
  }

  if (input.channels.includes("voice") && input.eligibleChannels.voice && input.limits.maxVoiceCallsPerAssignment > 0) {
    const call = adjustForQuietHours(
      { kind: "voice_call", at: due - input.overrides.voiceCallLeadMinutes * MINUTE },
      due,
      input.quiet,
    );
    if (call && call.at >= now + MIN_LEAD) out.push(toPlanned(input, "voice", call));
  }

  return out.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}

/**
 * Pre-deadline reminders inside quiet hours move earlier (to just before
 * quiet hours begin) so they still arrive before the deadline; a moved
 * "due now" becomes a "before deadline" reminder so its wording stays true.
 * Overdue reminders move later, to when quiet hours end.
 */
export function adjustForQuietHours(c: Candidate, due: number, quiet: QuietHours): Candidate | null {
  const at = new Date(c.at);
  if (!isWithinQuietHours(at, quiet)) return c;
  if (c.kind === "overdue") {
    return { kind: c.kind, at: quietPeriodEnd(at, quiet).getTime(), rank: rankOf(c) };
  }
  const earlier = quietPeriodStart(at, quiet).getTime() - QUIET_LEAD_BUFFER;
  if (earlier > due) return null;
  return { kind: c.kind === "due_now" ? "before_deadline" : c.kind, at: earlier, rank: rankOf(c) };
}

/** Greedy selection by priority enforcing a minimum gap and a cap. */
export function selectWithGap(candidates: Candidate[], minGapMs: number, cap: number): Candidate[] {
  const byPriority = [...candidates].sort((a, b) => rankOf(b) - rankOf(a) || a.at - b.at);
  const chosen: Candidate[] = [];
  for (const c of byPriority) {
    if (chosen.length >= cap) break;
    if (chosen.some((k) => Math.abs(k.at - c.at) < minGapMs)) continue;
    chosen.push(c);
  }
  return chosen.sort((a, b) => a.at - b.at);
}

function toPlanned(input: PlanInput, channel: Channel, c: Candidate): PlannedReminder {
  const at = new Date(Math.floor(c.at / MINUTE) * MINUTE);
  return {
    channel,
    kind: c.kind,
    scheduledAt: at,
    occurrenceKey: `${input.assignmentId}:${input.scheduleVersion}:${channel}:${c.kind}:${at.toISOString()}`,
  };
}
