"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fail, type ActionResult } from "@/lib/validation/common";
import { toAppError, userMessage } from "@/lib/db/errors";
import { rescheduleAssignment } from "@/lib/scheduler/sync";
import { dispatchNow } from "@/lib/scheduler/run";

export async function retryJobAction(jobId: string): Promise<ActionResult<{ retried: boolean }>> {
  const { user } = await requireAdmin("ops");
  if (!z.uuid().safeParse(jobId).success) return fail("Invalid job id.");
  const { data, error } = await supabaseAdmin().rpc("admin_retry_job", { p_admin_id: user.id, p_job_id: jobId });
  if (error) return fail(userMessage(toAppError(error)));
  revalidatePath("/admin");
  return data
    ? { ok: true, data: { retried: true } }
    : fail("This job isn't eligible for retry (it may already have reached the provider).", "not_retryable");
}

const limitsSchema = z.object({
  max_reminders_per_assignment: z.number().int().min(1).max(30),
  max_voice_calls_per_assignment: z.number().int().min(0).max(3),
  max_voice_calls_per_day: z.number().int().min(0).max(3),
  min_gap_minutes: z.number().int().min(15).max(720),
  max_active_assignments: z.number().int().min(1).max(500),
  max_scheduled_jobs_per_user: z.number().int().min(10).max(2000),
});

export async function updateReminderLimitsAction(input: unknown): Promise<ActionResult> {
  const { user } = await requireAdmin("ops");
  const parsed = limitsSchema.safeParse(input);
  if (!parsed.success) return fail("Values are out of range.", "validation");
  const db = supabaseAdmin();
  const { error } = await db
    .from("system_settings")
    .update({ value: parsed.data, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq("key", "reminder_limits");
  if (error) return fail("Couldn't save settings.");
  await db
    .from("admin_audit_log")
    .insert({
      actor_id: user.id,
      action: "settings.reminder_limits",
      target_type: "system_settings",
      target_id: "reminder_limits",
      metadata: parsed.data,
    });
  revalidatePath("/admin");
  return { ok: true, data: undefined };
}

export async function reviewSubmissionAction(input: unknown): Promise<ActionResult> {
  const { user } = await requireAdmin("reviewer");
  const parsed = z
    .object({ submissionId: z.uuid(), decision: z.enum(["accept", "reject"]), note: z.string().max(500).optional() })
    .safeParse(input);
  if (!parsed.success) return fail("Invalid request.");
  const db = supabaseAdmin();
  const { data, error } = await db.rpc("review_submission", {
    p_reviewer_id: user.id,
    p_submission_id: parsed.data.submissionId,
    p_decision: parsed.data.decision,
    p_note: parsed.data.note ?? undefined,
  });
  if (error || !data) return fail(userMessage(toAppError(error)));
  const assignment = (data as { assignment: { id: string } }).assignment;
  if (parsed.data.decision === "reject") await rescheduleAssignment(db, assignment.id);
  revalidatePath("/admin");
  return { ok: true, data: undefined };
}

/** Manually run one scheduler tick (useful in development and incident response). */
export async function runSchedulerNowAction(): Promise<ActionResult<{ claimed: number; sent: number }>> {
  const { user } = await requireAdmin("ops");
  const summary = await dispatchNow();
  await supabaseAdmin()
    .from("admin_audit_log")
    .insert({ actor_id: user.id, action: "scheduler.run_now", metadata: { claimed: summary.claimed } });
  revalidatePath("/admin");
  return {
    ok: true,
    data: { claimed: summary.claimed, sent: summary.results.filter((r) => r.outcome === "sent").length },
  };
}
