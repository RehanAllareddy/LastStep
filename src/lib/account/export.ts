import "server-only";
import type { AdminClient } from "@/lib/supabase/admin";

/** Everything LastStep stores about a user, as JSON. Evidence images are listed, not embedded. */
export async function exportUserData(db: AdminClient, userId: string) {
  const q = <T>(p: PromiseLike<{ data: T | null }>) => p.then((r) => r.data);
  const [profile, preferences, contacts, consents, assignments, events, submissions, jobs, notifications] =
    await Promise.all([
      q(db.from("profiles").select("*").eq("id", userId).maybeSingle()),
      q(db.from("notification_preferences").select("*").eq("user_id", userId).maybeSingle()),
      q(
        db
          .from("contact_methods")
          .select("id, contact_type, normalized_value, verified_at, is_active, created_at")
          .eq("user_id", userId),
      ),
      q(db.from("notification_consents").select("*").eq("user_id", userId).order("granted_at")),
      q(db.from("assignments").select("*").eq("user_id", userId).order("created_at")),
      q(db.from("assignment_events").select("*").eq("user_id", userId).order("created_at")),
      q(
        db
          .from("submissions")
          .select(
            "id, assignment_id, mime_type, file_size_bytes, width, height, status, self_attested, submitted_at, reviewed_at, deleted_at",
          )
          .eq("user_id", userId),
      ),
      q(
        db
          .from("reminder_jobs")
          .select(
            "id, assignment_id, channel, kind, scheduled_at, status, sent_at, delivered_at, canceled_at, cancel_reason, failure_category, simulated",
          )
          .eq("user_id", userId)
          .order("scheduled_at"),
      ),
      q(db.from("notification_events").select("*").eq("user_id", userId).order("occurred_at")),
    ]);
  return {
    exported_at: new Date().toISOString(),
    note: "Screenshot images are not embedded. Download them individually from Completed Work while signed in.",
    profile,
    notification_preferences: preferences,
    contact_methods: contacts,
    notification_consents: consents,
    assignments,
    assignment_events: events,
    submissions,
    reminder_jobs: jobs,
    notification_events: notifications,
  };
}
