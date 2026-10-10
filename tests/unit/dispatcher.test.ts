import { describe, expect, it, vi } from "vitest";
import { dispatchClaimedJob, dispatchDueReminders, triggerOccurrence } from "@/lib/scheduler/dispatcher";
import type { DispatchContext } from "@/lib/scheduler/eligibility";
import type { NotificationProvider } from "@/lib/notifications/provider";
import { ProviderError } from "@/lib/scheduler/retry";
import type { ReminderStore } from "@/lib/scheduler/store";

const NOW = new Date("2026-10-12T16:00:00Z");

function context(): DispatchContext {
  return {
    job: {
      id: "j1",
      assignment_id: "a",
      user_id: "u",
      channel: "sms",
      kind: "due_now",
      status: "processing",
      scheduled_at: NOW.toISOString(),
      original_scheduled_at: NOW.toISOString(),
      attempt_count: 1,
      max_attempts: 4,
      schedule_version: 1,
    },
    assignment: {
      id: "a",
      title: "Essay",
      status: "active",
      due_at: NOW.toISOString(),
      time_zone: "UTC",
      channels: ["sms"],
      schedule_version: 1,
    },
    account_active: true,
    preferences: {
      sms_enabled: true,
      voice_calls_enabled: false,
      quiet_hours_start: "22:00",
      quiet_hours_end: "07:00",
      time_zone: "UTC",
      max_daily_notifications: 4,
    },
    contact: { id: "c", phone: "+15555550100", phone_hash: "hash", verified: true },
    consent: { sms: true, voice: false },
    suppressed: false,
    sent_today: 0,
    voice_today: 0,
    last_sent_for_assignment: null,
    limits: {},
  };
}

/** In-memory store emulating the SQL claim semantics (status transitions). */
function memoryStore(ctx: DispatchContext, sendable = true) {
  const state = {
    status: "scheduled" as string,
    finalized: [] as { outcome: string; details: Record<string, unknown> }[],
    suppressed: [] as string[],
  };
  const store: ReminderStore = {
    markOverdue: async () => 0,
    claimDue: async () => {
      if (state.status !== "scheduled") return [];
      state.status = "processing";
      return [ctx.job.id];
    },
    claimOne: async () => {
      if (state.status !== "scheduled") return false;
      state.status = "processing";
      return true;
    },
    getContext: async () => ({ ...ctx, job: { ...ctx.job, status: state.status } }),
    confirmSendable: async () => sendable,
    finalize: async (_id, outcome, details) => {
      if (state.status !== "processing") return state.status;
      state.finalized.push({ outcome, details });
      state.status = outcome === "retry" ? "scheduled" : outcome === "deferred" ? "scheduled" : outcome;
      return state.status;
    },
    suppressPhone: async (h) => void state.suppressed.push(h),
    syncJobs: async () => ({}),
  };
  return { store, state };
}

function provider(impl?: () => Promise<never>): NotificationProvider & { sendSms: ReturnType<typeof vi.fn> } {
  return {
    name: "simulated",
    voiceAvailable: true,
    sendSms: vi.fn(impl ?? (async () => ({ providerMessageId: "SM1", providerStatus: "queued", simulated: true }))),
    placeCall: vi.fn(),
  } as never;
}

describe("dispatcher", () => {
  it("sends once and records the provider id", async () => {
    const { store, state } = memoryStore(context());
    const p = provider();
    const summary = await dispatchDueReminders({ store, provider: p, now: () => NOW });
    expect(summary.claimed).toBe(1);
    expect(p.sendSms).toHaveBeenCalledTimes(1);
    expect(p.sendSms.mock.calls[0]![0].body).toContain("Reply STOP");
    expect(state.finalized).toEqual([
      { outcome: "sent", details: { provider_message_id: "SM1", provider_status: "queued", simulated: true } },
    ]);
  });

  it("dispatches a triggered occurrence at most once under concurrent triggers", async () => {
    const { store } = memoryStore(context());
    const p = provider();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => triggerOccurrence("j1", { store, provider: p, now: () => NOW })),
    );
    expect(p.sendSms).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r.outcome === "sent")).toHaveLength(1);
    expect(results.filter((r) => r.outcome === "not_claimed")).toHaveLength(4);
  });

  it("cancels without contacting the provider when the final SQL check fails", async () => {
    const { store, state } = memoryStore(context(), false);
    const p = provider();
    await store.claimOne("j1");
    const r = await dispatchClaimedJob("j1", { store, provider: p, now: () => NOW });
    expect(r).toMatchObject({ outcome: "canceled", reason: "ineligible_at_send" });
    expect(p.sendSms).not.toHaveBeenCalled();
    expect(state.status).toBe("canceled");
  });

  it("cancels when consent is missing", async () => {
    const ctx = context();
    ctx.consent.sms = false;
    const { store } = memoryStore(ctx);
    const p = provider();
    await store.claimOne("j1");
    expect(await dispatchClaimedJob("j1", { store, provider: p, now: () => NOW })).toMatchObject({
      outcome: "canceled",
      reason: "no_consent",
    });
    expect(p.sendSms).not.toHaveBeenCalled();
  });

  it("schedules a retry with backoff on a retryable outage", async () => {
    const { store, state } = memoryStore(context());
    const p = provider(async () => {
      throw new ProviderError("down", 503);
    });
    await store.claimOne("j1");
    const r = await dispatchClaimedJob("j1", { store, provider: p, now: () => NOW, random: () => 1 });
    expect(r).toMatchObject({ outcome: "retry", category: "provider_unavailable" });
    expect(state.finalized[0]!.details.retry_at).toBe(new Date(NOW.getTime() + 60_000).toISOString());
    expect(state.status).toBe("scheduled");
  });

  it("dead-letters ambiguous failures instead of retrying", async () => {
    const { store, state } = memoryStore(context());
    const p = provider(async () => {
      throw new ProviderError("timeout", undefined, undefined, "ETIMEDOUT");
    });
    await store.claimOne("j1");
    expect(await dispatchClaimedJob("j1", { store, provider: p, now: () => NOW })).toMatchObject({
      outcome: "failed",
      category: "unknown_outcome",
    });
    expect(state.status).toBe("failed");
  });

  it("suppresses the number when the provider reports an opt-out", async () => {
    const { store, state } = memoryStore(context());
    const p = provider(async () => {
      throw new ProviderError("opted out", 400, 21610);
    });
    await store.claimOne("j1");
    await dispatchClaimedJob("j1", { store, provider: p, now: () => NOW });
    expect(state.suppressed).toEqual(["hash"]);
    expect(state.status).toBe("failed");
  });
});
