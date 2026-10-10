export type ReminderIntensity = "gentle" | "standard" | "intensive";
export type Channel = "sms" | "voice";
export type ReminderKind = "follow_up" | "before_deadline" | "due_now" | "overdue" | "voice_call";

export interface ReminderPreset {
  /** Hours before the deadline at which to remind (largest first). */
  leadTimesHours: number[];
  /** Check-in cadence between creation and the first lead-time reminder. */
  followUpIntervalHours: number | null;
  /** Spacing of reminders after the deadline passes. */
  overdueIntervalHours: number;
  overdueCount: number;
}

/**
 * Intensity presets. Deliberately conservative: even "intensive" stays well
 * below one message per hour, and quiet hours, the daily cap and the
 * per-assignment cap all still apply.
 */
export const PRESETS: Record<ReminderIntensity, ReminderPreset> = {
  gentle: { leadTimesHours: [24], followUpIntervalHours: null, overdueIntervalHours: 24, overdueCount: 1 },
  standard: { leadTimesHours: [24, 3], followUpIntervalHours: 72, overdueIntervalHours: 12, overdueCount: 2 },
  intensive: { leadTimesHours: [48, 24, 6, 1], followUpIntervalHours: 24, overdueIntervalHours: 6, overdueCount: 3 },
};

export const INTENSITY_DESCRIPTIONS: Record<ReminderIntensity, string> = {
  gentle: "A reminder the day before, one at the deadline, and one follow-up if it's overdue.",
  standard: "Check-ins every few days, reminders 24h and 3h before, at the deadline, and up to two overdue follow-ups.",
  intensive:
    "Daily check-ins, reminders 48h, 24h, 6h and 1h before, at the deadline, and up to three overdue follow-ups.",
};

export interface UserReminderOverrides {
  firstReminderLeadHours?: number | null;
  followUpIntervalHours?: number | null;
  overdueIntervalHours?: number | null;
  voiceCallLeadMinutes: number;
}

export interface ReminderLimits {
  maxRemindersPerAssignment: number;
  maxVoiceCallsPerAssignment: number;
  maxVoiceCallsPerDay: number;
  minGapMinutes: number;
}

export const DEFAULT_LIMITS: ReminderLimits = {
  maxRemindersPerAssignment: 12,
  maxVoiceCallsPerAssignment: 1,
  maxVoiceCallsPerDay: 1,
  minGapMinutes: 45,
};

/** Maximum follow-up check-ins generated before the lead-time reminders. */
export const MAX_FOLLOW_UPS = 6;

export function resolvePreset(intensity: ReminderIntensity, overrides: UserReminderOverrides): ReminderPreset {
  const base = PRESETS[intensity];
  let leads = [...base.leadTimesHours].sort((a, b) => b - a);
  if (overrides.firstReminderLeadHours) {
    const first = overrides.firstReminderLeadHours;
    leads = [first, ...leads.filter((h) => h < first)];
  }
  return {
    leadTimesHours: leads,
    followUpIntervalHours:
      overrides.followUpIntervalHours !== undefined && overrides.followUpIntervalHours !== null
        ? overrides.followUpIntervalHours
        : base.followUpIntervalHours,
    overdueIntervalHours: overrides.overdueIntervalHours ?? base.overdueIntervalHours,
    overdueCount: base.overdueCount,
  };
}

export function limitsFromSettings(value: unknown): ReminderLimits {
  const v = (value ?? {}) as Record<string, unknown>;
  const num = (k: string, d: number) => (typeof v[k] === "number" && Number.isFinite(v[k]) ? (v[k] as number) : d);
  return {
    maxRemindersPerAssignment: num("max_reminders_per_assignment", DEFAULT_LIMITS.maxRemindersPerAssignment),
    maxVoiceCallsPerAssignment: num("max_voice_calls_per_assignment", DEFAULT_LIMITS.maxVoiceCallsPerAssignment),
    maxVoiceCallsPerDay: num("max_voice_calls_per_day", DEFAULT_LIMITS.maxVoiceCallsPerDay),
    minGapMinutes: num("min_gap_minutes", DEFAULT_LIMITS.minGapMinutes),
  };
}
