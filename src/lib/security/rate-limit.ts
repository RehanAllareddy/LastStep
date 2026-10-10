import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AppError } from "@/lib/db/errors";

export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  otpSendPerUser: { limit: 5, windowSeconds: 3600 },
  otpSendPerPhone: { limit: 5, windowSeconds: 3600 },
  otpCheckPerUser: { limit: 15, windowSeconds: 3600 },
  assignmentWrite: { limit: 40, windowSeconds: 3600 },
  submissionUpload: { limit: 20, windowSeconds: 3600 },
  consentChange: { limit: 30, windowSeconds: 3600 },
  preferencesChange: { limit: 60, windowSeconds: 3600 },
  authAttemptPerIp: { limit: 20, windowSeconds: 900 },
  dataExport: { limit: 5, windowSeconds: 3600 },
} satisfies Record<string, RateLimitRule>;

/** Database-backed limiter (shared across serverless instances). Fails closed. */
export async function enforceRateLimit(bucket: string, rule: RateLimitRule): Promise<void> {
  const { data, error } = await supabaseAdmin().rpc("consume_rate_limit", {
    p_bucket: bucket,
    p_limit: rule.limit,
    p_window_seconds: rule.windowSeconds,
  });
  if (error) throw new AppError("internal");
  if (!data) throw new AppError("rate_limited", "Too many attempts. Please wait a while and try again.");
}
