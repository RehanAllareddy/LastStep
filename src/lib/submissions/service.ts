import "server-only";
import { randomUUID } from "node:crypto";
import { AppError, toAppError } from "@/lib/db/errors";
import type { AdminClient } from "@/lib/supabase/admin";
import { evidencePath, removeEvidence, uploadEvidence } from "@/lib/storage/evidence";
import { notificationProvider, statusCallbackUrl } from "@/lib/notifications";
import { renderCompletionSms } from "@/lib/notifications/messages";
import { isWithinQuietHours } from "@/lib/time/quiet-hours";
import { IMAGE_ERROR_MESSAGES, processScreenshot } from "./image";
import type { Database } from "@/types/database";

type Assignment = Database["public"]["Tables"]["assignments"]["Row"];
type Submission = Database["public"]["Tables"]["submissions"]["Row"];

export interface SubmissionOutcome {
  assignment: Assignment;
  submission: Submission;
  canceledJobs: number;
}

/**
 * Full submission workflow: ownership check -> validate/re-encode -> private
 * upload -> atomic create_submission (status change + reminder cancellation
 * under a row lock) -> optional completion SMS.
 */
export async function submitEvidence(
  db: AdminClient,
  userId: string,
  assignmentId: string,
  file: Buffer,
  selfAttested: boolean,
): Promise<SubmissionOutcome> {
  const { data: assignment } = await db
    .from("assignments")
    .select("id, user_id, status")
    .eq("id", assignmentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!assignment) throw new AppError("not_found");
  if (!["active", "overdue", "paused"].includes(assignment.status)) throw new AppError("not_submittable");

  const image = await processScreenshot(file);
  if (!image.ok) throw new AppError(`image_${image.reason}`, IMAGE_ERROR_MESSAGES[image.reason]);

  const submissionId = randomUUID();
  const path = evidencePath(userId, assignmentId, submissionId);
  await uploadEvidence(db, path, image.buffer, image.mime);

  const { data, error } = await db.rpc("create_submission", {
    p_user_id: userId,
    p_assignment_id: assignmentId,
    p_submission_id: submissionId,
    p_storage_path: path,
    p_mime_type: image.mime,
    p_file_size_bytes: image.buffer.length,
    p_width: image.width,
    p_height: image.height,
    p_self_attested: selfAttested,
  });
  if (error || !data) {
    // Don't orphan evidence if the state change was refused (e.g. double submit).
    await removeEvidence(db, [path]).catch(() => undefined);
    throw toAppError(error);
  }
  const result = data as unknown as { assignment: Assignment; submission: Submission; canceled_jobs: number };
  if (result.assignment.status === "completed") {
    await sendCompletionMessage(db, userId, result.assignment).catch(() => {
      console.error("[submissions] completion message failed", { assignmentId });
    });
  }
  return { assignment: result.assignment, submission: result.submission, canceledJobs: result.canceled_jobs };
}

/** Sends the "accepted" SMS only with consent, the preference on, and outside quiet hours. */
export async function sendCompletionMessage(db: AdminClient, userId: string, assignment: Assignment) {
  if (!assignment.channels.includes("sms")) return;
  const [prefs, consent, contact] = await Promise.all([
    db.from("notification_preferences").select("*").eq("user_id", userId).single(),
    db
      .from("notification_consents")
      .select("id")
      .eq("user_id", userId)
      .eq("category", "sms_reminders")
      .eq("consent_status", "granted")
      .maybeSingle(),
    db
      .from("contact_methods")
      .select("normalized_value, value_hash, verified_at")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle(),
  ]);
  const p = prefs.data;
  if (!p || !p.sms_enabled || !p.completion_messages_enabled || !consent.data || !contact.data?.verified_at) return;
  const suppressed = await db
    .from("phone_suppressions")
    .select("phone_hash")
    .eq("phone_hash", contact.data.value_hash)
    .is("lifted_at", null)
    .maybeSingle();
  if (suppressed.data) return;
  if (
    isWithinQuietHours(new Date(), {
      start: p.quiet_hours_start.slice(0, 5),
      end: p.quiet_hours_end.slice(0, 5),
      timeZone: p.time_zone,
    })
  )
    return;

  const res = await notificationProvider().sendSms({
    to: contact.data.normalized_value,
    body: renderCompletionSms(assignment.title),
    statusCallbackUrl: statusCallbackUrl("/api/webhooks/twilio/status"),
    userId,
    kind: "completion",
  });
  await db.from("notification_events").insert({
    user_id: userId,
    assignment_id: assignment.id,
    channel: "sms",
    event_type: "completion_sent",
    provider_status: res.providerStatus,
    metadata: { simulated: res.simulated },
  });
}

export async function deleteEvidence(db: AdminClient, userId: string, submissionId: string) {
  const { data, error } = await db.rpc("delete_submission_evidence", {
    p_user_id: userId,
    p_submission_id: submissionId,
  });
  if (error || !data) throw toAppError(error);
  await removeEvidence(db, [data]);
}
