import "server-only";
import { localToUtc } from "@/lib/time/zones";
import { AppError, toAppError } from "@/lib/db/errors";
import type { AdminClient } from "@/lib/supabase/admin";
import { rescheduleAssignment } from "@/lib/scheduler/sync";
import type { AssignmentFormValues } from "@/lib/validation/assignment";
import type { Database, Json } from "@/types/database";

export type Assignment = Database["public"]["Tables"]["assignments"]["Row"];

/** Deadlines within this window are treated as already passed. */
export const MIN_DEADLINE_LEAD_MS = 5 * 60_000;

export type DeadlineResolution =
  | { kind: "future"; dueAt: Date }
  | { kind: "recovery"; dueAt: Date; originalDueAt: Date }
  | { kind: "needs_recovery"; originalDueAt: Date }
  | { kind: "invalid"; field: "dueTime" | "recoveryDueTime"; message: string };

/** Interprets form date/time fields in the chosen zone and applies the overdue-recovery rule. */
export function resolveDeadline(v: AssignmentFormValues, now: Date): DeadlineResolution {
  const due = localToUtc(v.dueDate, v.dueTime, v.timeZone);
  if (!due.ok) {
    return {
      kind: "invalid",
      field: "dueTime",
      message:
        due.reason === "nonexistent_local_time"
          ? "That time doesn't exist on this date because of a daylight-saving change. Pick another time."
          : due.reason === "invalid_time_zone"
            ? "Choose a valid time zone."
            : "Enter a valid date and time.",
    };
  }
  if (due.instant.getTime() > now.getTime() + MIN_DEADLINE_LEAD_MS) return { kind: "future", dueAt: due.instant };
  if (!v.recoveryDueDate || !v.recoveryDueTime) return { kind: "needs_recovery", originalDueAt: due.instant };
  const recovery = localToUtc(v.recoveryDueDate, v.recoveryDueTime, v.timeZone);
  if (!recovery.ok)
    return { kind: "invalid", field: "recoveryDueTime", message: "Enter a valid recovery date and time." };
  if (recovery.instant.getTime() <= now.getTime() + MIN_DEADLINE_LEAD_MS) {
    return { kind: "invalid", field: "recoveryDueTime", message: "Your new target needs to be in the future." };
  }
  return { kind: "recovery", dueAt: recovery.instant, originalDueAt: due.instant };
}

function payloadFrom(v: AssignmentFormValues, allowedChannels: ("sms" | "voice")[]) {
  return {
    title: v.title,
    description: v.description,
    subject: v.subject,
    time_zone: v.timeZone,
    priority: v.priority,
    estimated_minutes: v.estimatedMinutes === "" ? null : Number(v.estimatedMinutes),
    reminder_intensity: v.reminderIntensity,
    channels: v.channels.filter((c) => allowedChannels.includes(c)),
    commitment: v.commitment,
    completion_policy: v.completionPolicy,
  };
}

export async function createAssignment(
  db: AdminClient,
  userId: string,
  v: AssignmentFormValues,
  deadline: { dueAt: Date; originalDueAt?: Date },
  allowedChannels: ("sms" | "voice")[],
): Promise<Assignment> {
  const payload = {
    ...payloadFrom(v, allowedChannels),
    due_at: deadline.dueAt.toISOString(),
    original_due_at: deadline.originalDueAt?.toISOString() ?? null,
    is_recovery_plan: Boolean(deadline.originalDueAt),
  };
  const { data, error } = await db.rpc("create_assignment", { p_user_id: userId, p_payload: payload as Json });
  if (error || !data) throw toAppError(error);
  await rescheduleAssignment(db, data.id);
  return data;
}

export async function updateAssignment(
  db: AdminClient,
  userId: string,
  assignmentId: string,
  v: AssignmentFormValues,
  dueAt: Date,
  allowedChannels: ("sms" | "voice")[],
): Promise<Assignment> {
  const payload = { ...payloadFrom(v, allowedChannels), due_at: dueAt.toISOString() };
  const { data, error } = await db.rpc("update_assignment", {
    p_user_id: userId,
    p_assignment_id: assignmentId,
    p_payload: payload as Json,
  });
  if (error || !data) throw toAppError(error);
  await rescheduleAssignment(db, data.id);
  return data;
}

export async function transitionAssignment(
  db: AdminClient,
  userId: string,
  assignmentId: string,
  action: "pause" | "resume" | "cancel",
): Promise<Assignment> {
  const { data, error } = await db.rpc("transition_assignment", {
    p_user_id: userId,
    p_assignment_id: assignmentId,
    p_action: action,
  });
  if (error || !data) throw toAppError(error);
  if (action === "resume") await rescheduleAssignment(db, data.id);
  return data;
}

/** Channels the user may select right now (consent + verified phone). */
export async function allowedChannelsFor(db: AdminClient, userId: string): Promise<("sms" | "voice")[]> {
  const { data } = await db
    .from("notification_consents")
    .select("category")
    .eq("user_id", userId)
    .eq("consent_status", "granted");
  const cats = new Set((data ?? []).map((r) => r.category));
  const out: ("sms" | "voice")[] = [];
  if (cats.has("sms_reminders")) out.push("sms");
  if (cats.has("voice_reminders")) out.push("voice");
  return out;
}

export function assertOwned<T extends { user_id: string }>(row: T | null, userId: string): T {
  if (!row || row.user_id !== userId) throw new AppError("not_found");
  return row;
}
