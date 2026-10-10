import "server-only";
import { serverEnv } from "@/lib/env";
import { SMS_AGREEMENT_VERSION } from "@/lib/consent/agreements";
import { remindersAllowed, type AssignmentStatus } from "@/lib/assignments/state-machine";
import type { AdminClient } from "@/lib/supabase/admin";
import { computeReminderPlan, type PlannedReminder } from "./plan";
import { limitsFromSettings, type Channel, type ReminderIntensity, type ReminderLimits } from "./policy";
import { createSupabaseReminderStore } from "./store";

export interface SchedulingContext {
  eligibleChannels: Record<Channel, boolean>;
  quiet: { start: string; end: string; timeZone: string };
  overrides: {
    firstReminderLeadHours: number | null;
    followUpIntervalHours: number | null;
    overdueIntervalHours: number | null;
    voiceCallLeadMinutes: number;
  };
  limits: ReminderLimits;
}

export async function loadSchedulingContext(db: AdminClient, userId: string): Promise<SchedulingContext> {
  const [prefs, contact, consents, settings] = await Promise.all([
    db.from("notification_preferences").select("*").eq("user_id", userId).single(),
    db
      .from("contact_methods")
      .select("value_hash, verified_at")
      .eq("user_id", userId)
      .eq("is_active", true)
      .eq("contact_type", "phone")
      .maybeSingle(),
    db.from("notification_consents").select("category").eq("user_id", userId).eq("consent_status", "granted"),
    db.from("system_settings").select("value").eq("key", "reminder_limits").maybeSingle(),
  ]);
  if (prefs.error || !prefs.data) throw new Error("preferences not found");
  const p = prefs.data;
  let suppressed = false;
  if (contact.data) {
    const s = await db
      .from("phone_suppressions")
      .select("phone_hash")
      .eq("phone_hash", contact.data.value_hash)
      .is("lifted_at", null)
      .maybeSingle();
    suppressed = Boolean(s.data);
  }
  const granted = new Set((consents.data ?? []).map((c) => c.category));
  const reachable = Boolean(contact.data?.verified_at) && !suppressed;
  return {
    eligibleChannels: {
      sms: reachable && p.sms_enabled && granted.has("sms_reminders"),
      voice: reachable && p.voice_calls_enabled && granted.has("voice_reminders") && serverEnv().voiceConfigured,
    },
    quiet: { start: p.quiet_hours_start.slice(0, 5), end: p.quiet_hours_end.slice(0, 5), timeZone: p.time_zone },
    overrides: {
      firstReminderLeadHours: p.first_reminder_lead_hours,
      followUpIntervalHours: p.follow_up_interval_hours,
      overdueIntervalHours: p.overdue_interval_hours,
      voiceCallLeadMinutes: p.voice_call_lead_minutes,
    },
    limits: limitsFromSettings(settings.data?.value),
  };
}

interface AssignmentForPlan {
  id: string;
  status: AssignmentStatus;
  due_at: string;
  reminder_intensity: ReminderIntensity;
  channels: Channel[];
  schedule_version: number;
}

export function planFor(a: AssignmentForPlan, ctx: SchedulingContext, now: Date): PlannedReminder[] {
  if (!remindersAllowed(a.status)) return [];
  return computeReminderPlan({
    assignmentId: a.id,
    scheduleVersion: a.schedule_version,
    now,
    dueAt: new Date(a.due_at),
    intensity: a.reminder_intensity,
    channels: a.channels,
    eligibleChannels: ctx.eligibleChannels,
    quiet: ctx.quiet,
    overrides: ctx.overrides,
    limits: ctx.limits,
  });
}

/** Rebuild the pending reminder plan for one assignment. Safe to call repeatedly. */
export async function rescheduleAssignment(db: AdminClient, assignmentId: string, now = new Date()) {
  const { data: a, error } = await db
    .from("assignments")
    .select("id, user_id, status, due_at, reminder_intensity, channels, schedule_version")
    .eq("id", assignmentId)
    .single();
  if (error || !a) return { status: "not_found" as const };
  const ctx = await loadSchedulingContext(db, a.user_id);
  const plan = planFor(a, ctx, now);
  const store = createSupabaseReminderStore(db, SMS_AGREEMENT_VERSION);
  return { status: "ok" as const, planned: plan.length, result: await store.syncJobs(a.id, a.schedule_version, plan) };
}

/** Rebuild plans for every open assignment of a user (after consent/preference changes). */
export async function rescheduleUserAssignments(db: AdminClient, userId: string, now = new Date()) {
  const { data } = await db
    .from("assignments")
    .select("id, status, due_at, reminder_intensity, channels, schedule_version")
    .eq("user_id", userId)
    .in("status", ["active", "overdue"]);
  if (!data?.length) return 0;
  const ctx = await loadSchedulingContext(db, userId);
  const store = createSupabaseReminderStore(db, SMS_AGREEMENT_VERSION);
  for (const a of data) {
    await store.syncJobs(a.id, a.schedule_version, planFor(a, ctx, now));
  }
  return data.length;
}
