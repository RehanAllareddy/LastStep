import "server-only";
import type { AdminClient } from "@/lib/supabase/admin";
import type { NotificationProvider } from "./provider";
import { localDateString, localParts } from "@/lib/time/zones";
import { isWithinQuietHours } from "@/lib/time/quiet-hours";
import { localDayBounds } from "@/lib/assignments/queries";
import { formatDueTime, sanitizeTitle } from "./messages";

export const SUMMARY_LOCAL_HOUR = 8;

export function renderSummarySms(items: { title: string; dueAt: Date }[], timeZone: string): string {
  const first = items[0]!;
  const rest = items.length - 1;
  return `LastStep morning summary: ${items.length} assignment${items.length === 1 ? "" : "s"} due in the next 48 hours — '${sanitizeTitle(first.title)}' (${formatDueTime(first.dueAt, timeZone)})${rest > 0 ? ` and ${rest} more` : ""}. Reply STOP to stop SMS reminders.`;
}

/**
 * Hourly job: users whose local time is 8 AM and who opted into summaries get
 * at most one summary per local day, subject to consent, verification,
 * suppression, quiet hours and the daily cap.
 */
export async function sendMorningSummaries(db: AdminClient, provider: NotificationProvider, now = new Date()) {
  const { data: prefs } = await db
    .from("notification_preferences")
    .select("user_id, time_zone, quiet_hours_start, quiet_hours_end, max_daily_notifications")
    .eq("summaries_enabled", true)
    .eq("sms_enabled", true);
  let sent = 0;
  for (const p of prefs ?? []) {
    if (localParts(now, p.time_zone).hour !== SUMMARY_LOCAL_HOUR) continue;
    if (
      isWithinQuietHours(now, {
        start: p.quiet_hours_start.slice(0, 5),
        end: p.quiet_hours_end.slice(0, 5),
        timeZone: p.time_zone,
      })
    )
      continue;
    const [profile, consent, contact] = await Promise.all([
      db.from("profiles").select("deletion_requested_at").eq("id", p.user_id).single(),
      db
        .from("notification_consents")
        .select("id")
        .eq("user_id", p.user_id)
        .eq("category", "sms_reminders")
        .eq("consent_status", "granted")
        .maybeSingle(),
      db
        .from("contact_methods")
        .select("normalized_value, value_hash, verified_at")
        .eq("user_id", p.user_id)
        .eq("is_active", true)
        .maybeSingle(),
    ]);
    if (!profile.data || profile.data.deletion_requested_at || !consent.data || !contact.data?.verified_at) continue;
    const suppressed = await db
      .from("phone_suppressions")
      .select("phone_hash")
      .eq("phone_hash", contact.data.value_hash)
      .is("lifted_at", null)
      .maybeSingle();
    if (suppressed.data) continue;

    const { start } = localDayBounds(p.time_zone, now);
    const sentToday = await db
      .from("reminder_jobs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", p.user_id)
      .gte("sent_at", start.toISOString());
    if ((sentToday.count ?? 0) >= p.max_daily_notifications) continue;

    const { data: due } = await db
      .from("assignments")
      .select("title, due_at")
      .eq("user_id", p.user_id)
      .eq("status", "active")
      .gte("due_at", now.toISOString())
      .lte("due_at", new Date(now.getTime() + 48 * 3600_000).toISOString())
      .order("due_at");
    if (!due?.length) continue;

    // Atomic once-per-local-day guard (also protects against overlapping runs).
    const { data: allowed } = await db.rpc("consume_rate_limit", {
      p_bucket: `summary:${p.user_id}:${localDateString(now, p.time_zone)}`,
      p_limit: 1,
      p_window_seconds: 172800,
    });
    if (!allowed) continue;

    try {
      const res = await provider.sendSms({
        to: contact.data.normalized_value,
        body: renderSummarySms(
          due.map((d) => ({ title: d.title, dueAt: new Date(d.due_at) })),
          p.time_zone,
        ),
        userId: p.user_id,
        kind: "summary",
      });
      await db
        .from("notification_events")
        .insert({
          user_id: p.user_id,
          channel: "sms",
          event_type: "summary_sent",
          provider_status: res.providerStatus,
          metadata: { simulated: res.simulated, count: due.length },
        });
      sent++;
    } catch {
      await db
        .from("notification_events")
        .insert({ user_id: p.user_id, channel: "sms", event_type: "failed", metadata: { kind: "summary" } });
    }
  }
  return { sent };
}
