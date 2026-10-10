import "server-only";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import type { DispatchContext } from "./eligibility";
import type { PlannedReminder } from "./plan";

export type FinalizeOutcome = "sent" | "retry" | "deferred" | "failed" | "skipped" | "canceled";

/** Persistence operations the dispatcher needs. All atomicity lives in SQL. */
export interface ReminderStore {
  markOverdue(): Promise<number>;
  claimDue(limit: number): Promise<string[]>;
  claimOne(jobId: string): Promise<boolean>;
  getContext(jobId: string): Promise<DispatchContext | null>;
  confirmSendable(jobId: string): Promise<boolean>;
  finalize(jobId: string, outcome: FinalizeOutcome, details: Record<string, unknown>): Promise<string>;
  suppressPhone(phoneHash: string): Promise<void>;
  syncJobs(assignmentId: string, scheduleVersion: number, jobs: PlannedReminder[]): Promise<Json>;
}

export function createSupabaseReminderStore(db: AdminClient, agreementVersion: string): ReminderStore {
  const must = <T>(r: { data: T | null; error: { message: string } | null }, op: string): T => {
    if (r.error) throw new Error(`${op} failed: ${r.error.message}`);
    return r.data as T;
  };
  return {
    async markOverdue() {
      return must(await db.rpc("mark_overdue_assignments"), "mark_overdue_assignments");
    },
    async claimDue(limit) {
      return must(await db.rpc("claim_due_reminder_jobs", { p_limit: limit }), "claim_due_reminder_jobs") ?? [];
    },
    async claimOne(jobId) {
      return must(await db.rpc("claim_reminder_job", { p_job_id: jobId }), "claim_reminder_job");
    },
    async getContext(jobId) {
      const data = must(await db.rpc("get_dispatch_context", { p_job_id: jobId }), "get_dispatch_context");
      return (data as unknown as DispatchContext | null) ?? null;
    },
    async confirmSendable(jobId) {
      return must(await db.rpc("confirm_job_sendable", { p_job_id: jobId }), "confirm_job_sendable");
    },
    async finalize(jobId, outcome, details) {
      return must(
        await db.rpc("finalize_reminder_job", { p_job_id: jobId, p_outcome: outcome, p_details: details as Json }),
        "finalize_reminder_job",
      );
    },
    async suppressPhone(phoneHash) {
      must(
        await db.rpc("process_inbound_keyword", {
          p_phone_hash: phoneHash,
          p_keyword: "stop",
          p_agreement_version: agreementVersion,
        }),
        "process_inbound_keyword",
      );
    },
    async syncJobs(assignmentId, scheduleVersion, jobs) {
      return must(
        await db.rpc("sync_reminder_jobs", {
          p_assignment_id: assignmentId,
          p_schedule_version: scheduleVersion,
          p_jobs: jobs.map((j) => ({
            channel: j.channel,
            kind: j.kind,
            scheduled_at: j.scheduledAt.toISOString(),
            occurrence_key: j.occurrenceKey,
          })),
        }),
        "sync_reminder_jobs",
      );
    },
  };
}
