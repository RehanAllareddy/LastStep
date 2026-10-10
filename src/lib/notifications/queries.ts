import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { maskPhone } from "@/lib/security/phone";
import type { PreferencesValues } from "@/lib/validation/settings";

/** Notification state for the signed-in user (RLS-scoped reads). */
export async function loadNotificationState(userId: string) {
  const supabase = await createSupabaseServerClient();
  const [prefs, contact, consents] = await Promise.all([
    supabase.from("notification_preferences").select("*").eq("user_id", userId).single(),
    supabase
      .from("contact_methods")
      .select("id, normalized_value, verified_at")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("notification_consents")
      .select(
        "id, category, consent_status, agreement_version, granted_at, revoked_at, consent_source, revocation_source",
      )
      .eq("user_id", userId)
      .order("granted_at", { ascending: false }),
  ]);
  const p = prefs.data;
  const active = (cat: string) =>
    (consents.data ?? []).find((c) => c.category === cat && c.consent_status === "granted") ?? null;
  return {
    prefs: p,
    phone: contact.data
      ? { masked: maskPhone(contact.data.normalized_value), verified: Boolean(contact.data.verified_at) }
      : null,
    smsConsent: active("sms_reminders"),
    voiceConsent: active("voice_reminders"),
    consentHistory: consents.data ?? [],
  };
}

export function preferencesToForm(
  p: NonNullable<Awaited<ReturnType<typeof loadNotificationState>>["prefs"]>,
): PreferencesValues {
  return {
    timeZone: p.time_zone,
    quietHoursStart: p.quiet_hours_start.slice(0, 5),
    quietHoursEnd: p.quiet_hours_end.slice(0, 5),
    reminderIntensity: p.reminder_intensity,
    maxDailyNotifications: p.max_daily_notifications,
    summariesEnabled: p.summaries_enabled,
    completionMessagesEnabled: p.completion_messages_enabled,
    firstReminderLeadHours: p.first_reminder_lead_hours?.toString() ?? "",
    followUpIntervalHours: p.follow_up_interval_hours?.toString() ?? "",
    overdueIntervalHours: p.overdue_interval_hours?.toString() ?? "",
    voiceCallLeadMinutes: p.voice_call_lead_minutes,
  };
}
