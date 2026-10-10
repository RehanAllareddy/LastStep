import "server-only";
import { randomInt, randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { codeHash, maskPhone, safeEqualHex } from "@/lib/security/phone";
import { renderVerificationSms } from "./messages";
import type { NotificationProvider, VerificationProvider } from "./provider";

/**
 * Development provider: never contacts a carrier. Every "message" is written
 * to the dev_outbox table (visible at /dev/outbox) and clearly labeled
 * SIMULATED. env.ts refuses this provider when APP_ENV=production.
 */
export type OutboxSink = (row: {
  user_id: string | null;
  channel: string;
  to_masked: string;
  body: string;
  kind: string | null;
}) => Promise<void>;

export const dbOutboxSink: OutboxSink = async (row) => {
  const { error } = await supabaseAdmin().from("dev_outbox").insert(row);
  if (error) throw new Error("dev_outbox insert failed");
};

export interface SimulatedOptions {
  sink?: OutboxSink;
  /** Test hook to simulate outages: return an error to throw, or null. */
  failure?: () => Error | null;
}

export function createSimulatedProvider(opts: SimulatedOptions = {}): NotificationProvider {
  const sink = opts.sink ?? dbOutboxSink;
  return {
    name: "simulated",
    voiceAvailable: true,
    async sendSms({ to, body, userId, kind }) {
      const failure = opts.failure?.();
      if (failure) throw failure;
      await sink({
        user_id: userId ?? null,
        channel: "sms",
        to_masked: maskPhone(to),
        body: `[SIMULATED SMS] ${body}`,
        kind: kind ?? null,
      });
      return { providerMessageId: `SIM-SM-${randomUUID()}`, providerStatus: "simulated", simulated: true };
    },
    async placeCall({ to, script, userId }) {
      const failure = opts.failure?.();
      if (failure) throw failure;
      await sink({
        user_id: userId ?? null,
        channel: "voice",
        to_masked: maskPhone(to),
        body: `[SIMULATED CALL] ${script}`,
        kind: "voice_call",
      });
      return { providerMessageId: `SIM-CA-${randomUUID()}`, providerStatus: "simulated", simulated: true };
    },
  };
}

export function createSimulatedVerification(sink: OutboxSink = dbOutboxSink): VerificationProvider {
  return {
    name: "simulated",
    async start({ to, userId, verificationKey }) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      await sink({
        user_id: userId,
        channel: "sms",
        to_masked: maskPhone(to),
        body: `[SIMULATED VERIFICATION] ${renderVerificationSms(code)}`,
        kind: "verification",
      });
      return { codeHash: codeHash(verificationKey, code) };
    },
    async check({ code, verificationKey, codeHash: expected }) {
      if (!expected || !/^\d{4,10}$/.test(code)) return false;
      return safeEqualHex(codeHash(verificationKey, code), expected);
    },
  };
}
