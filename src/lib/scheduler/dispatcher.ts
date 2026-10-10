import { renderSms, renderVoiceScript } from "@/lib/notifications/messages";
import type { NotificationProvider } from "@/lib/notifications/provider";
import { evaluateDispatch, type DispatchContext } from "./eligibility";
import { backoffDelayMs, classifyProviderError } from "./retry";
import type { ReminderStore } from "./store";

export interface DispatcherDeps {
  store: ReminderStore;
  provider: NotificationProvider;
  now?: () => Date;
  random?: () => number;
  statusCallbackUrl?: (channel: "sms" | "voice") => string | undefined;
}

export type DispatchResult =
  | { jobId: string; outcome: "sent"; providerMessageId: string }
  | { jobId: string; outcome: "retry" | "failed"; category: string }
  | { jobId: string; outcome: "skipped" | "canceled" | "deferred"; reason: string }
  | { jobId: string; outcome: "not_claimed" | "missing" };

/**
 * Dispatch one job that the caller has already claimed (status=processing).
 * Order of checks: snapshot eligibility -> final atomic SQL check -> provider.
 */
export async function dispatchClaimedJob(jobId: string, deps: DispatcherDeps): Promise<DispatchResult> {
  const now = deps.now?.() ?? new Date();
  const ctx = await deps.store.getContext(jobId);
  if (!ctx) return { jobId, outcome: "missing" };
  if (ctx.job.status !== "processing") return { jobId, outcome: "not_claimed" };

  const decision = evaluateDispatch(ctx, now, { voiceConfigured: deps.provider.voiceAvailable });
  switch (decision.action) {
    case "cancel":
      await deps.store.finalize(jobId, "canceled", { reason: decision.reason });
      return { jobId, outcome: "canceled", reason: decision.reason };
    case "skip":
      await deps.store.finalize(jobId, "skipped", { reason: decision.reason });
      return { jobId, outcome: "skipped", reason: decision.reason };
    case "defer":
      await deps.store.finalize(jobId, "deferred", {
        reason: decision.reason,
        defer_until: decision.until.toISOString(),
      });
      return { jobId, outcome: "deferred", reason: decision.reason };
    case "send":
      break;
  }

  // Re-check assignment state, consent and suppression atomically right
  // before contacting the provider (narrows the race with a submission or
  // a STOP arriving after the snapshot was taken).
  if (!(await deps.store.confirmSendable(jobId))) {
    await deps.store.finalize(jobId, "canceled", { reason: "ineligible_at_send" });
    return { jobId, outcome: "canceled", reason: "ineligible_at_send" };
  }

  try {
    const result = await send(ctx, deps);
    await deps.store.finalize(jobId, "sent", {
      provider_message_id: result.providerMessageId,
      provider_status: result.providerStatus,
      simulated: result.simulated,
    });
    return { jobId, outcome: "sent", providerMessageId: result.providerMessageId };
  } catch (error) {
    const failure = classifyProviderError(error);
    if (failure.category === "opted_out" && ctx.contact) {
      await deps.store.suppressPhone(ctx.contact.phone_hash);
    }
    if (failure.retryable) {
      const retryAt = new Date(now.getTime() + backoffDelayMs(ctx.job.attempt_count, deps.random));
      const status = await deps.store.finalize(jobId, "retry", {
        failure_category: failure.category,
        retry_at: retryAt.toISOString(),
      });
      return { jobId, outcome: status === "failed" ? "failed" : "retry", category: failure.category };
    }
    await deps.store.finalize(jobId, "failed", { failure_category: failure.category });
    return { jobId, outcome: "failed", category: failure.category };
  }
}

async function send(ctx: DispatchContext, deps: DispatcherDeps) {
  const a = ctx.assignment!;
  const contact = ctx.contact!;
  const message = {
    kind: ctx.job.kind,
    title: a.title,
    dueAt: new Date(a.due_at),
    timeZone: ctx.preferences?.time_zone ?? a.time_zone,
  };
  if (ctx.job.channel === "voice") {
    return deps.provider.placeCall({
      to: contact.phone,
      script: renderVoiceScript(message),
      statusCallbackUrl: deps.statusCallbackUrl?.("voice"),
      userId: ctx.job.user_id,
    });
  }
  return deps.provider.sendSms({
    to: contact.phone,
    body: renderSms(message),
    statusCallbackUrl: deps.statusCallbackUrl?.("sms"),
    userId: ctx.job.user_id,
    kind: ctx.job.kind,
  });
}

/** Trigger one specific occurrence (e.g. a per-job scheduled event). At most one caller wins the claim. */
export async function triggerOccurrence(jobId: string, deps: DispatcherDeps): Promise<DispatchResult> {
  if (!(await deps.store.claimOne(jobId))) return { jobId, outcome: "not_claimed" };
  return dispatchClaimedJob(jobId, deps);
}

export interface DispatchSummary {
  overdueMarked: number;
  claimed: number;
  results: DispatchResult[];
}

/** One scheduler tick: mark overdue assignments, claim due jobs, dispatch each. */
export async function dispatchDueReminders(deps: DispatcherDeps, limit = 50): Promise<DispatchSummary> {
  const overdueMarked = await deps.store.markOverdue();
  const ids = await deps.store.claimDue(limit);
  const results: DispatchResult[] = [];
  for (const id of ids) {
    try {
      results.push(await dispatchClaimedJob(id, deps));
    } catch {
      // Unexpected internal error before the provider call: safe to retry later.
      // If it happened after a provider call, the job stays 'processing' and is
      // dead-lettered by the stale-lock sweep rather than resent.
      console.error("[dispatcher] internal error", { jobId: id });
      results.push({ jobId: id, outcome: "failed", category: "internal_error" });
    }
  }
  return { overdueMarked, claimed: ids.length, results };
}
