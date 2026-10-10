/**
 * Retry policy for provider calls. A retry is only safe when we know the
 * provider did NOT accept the request; anything ambiguous (timeouts, resets,
 * generic 500s) is dead-lettered as "unknown_outcome" so a student is never
 * messaged twice for the same occurrence.
 */

export type FailureCategory =
  | "rate_limited"
  | "provider_unavailable"
  | "network_error"
  | "unknown_outcome"
  | "opted_out"
  | "invalid_number"
  | "provider_auth"
  | "rejected"
  | "internal_error";

export interface ClassifiedFailure {
  category: FailureCategory;
  retryable: boolean;
  providerCode?: number;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly providerCode?: number,
    readonly networkCode?: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

// Network errors where the request provably never reached the provider.
const PRE_CONNECT_ERRORS = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH"]);
// Twilio error codes: https://www.twilio.com/docs/api/errors
const OPTED_OUT_CODES = new Set([21610]);
const INVALID_NUMBER_CODES = new Set([21211, 21214, 21217, 21407, 21408, 21612, 21614]);

export function classifyProviderError(error: unknown): ClassifiedFailure {
  const e = error as { status?: unknown; code?: unknown; providerCode?: unknown; networkCode?: unknown };
  const status = typeof e?.status === "number" ? e.status : undefined;
  const providerCode =
    typeof e?.providerCode === "number" ? e.providerCode : typeof e?.code === "number" ? e.code : undefined;
  const networkCode =
    typeof e?.networkCode === "string" ? e.networkCode : typeof e?.code === "string" ? e.code : undefined;

  if (providerCode !== undefined && OPTED_OUT_CODES.has(providerCode)) {
    return { category: "opted_out", retryable: false, providerCode };
  }
  if (providerCode !== undefined && INVALID_NUMBER_CODES.has(providerCode)) {
    return { category: "invalid_number", retryable: false, providerCode };
  }
  if (status === 429 || providerCode === 20429) return { category: "rate_limited", retryable: true, providerCode };
  if (status === 401 || status === 403 || providerCode === 20003) {
    return { category: "provider_auth", retryable: false, providerCode };
  }
  if (status === 502 || status === 503 || status === 504) {
    return { category: "provider_unavailable", retryable: true, providerCode };
  }
  if (networkCode && PRE_CONNECT_ERRORS.has(networkCode)) return { category: "network_error", retryable: true };
  if (status !== undefined && status >= 400 && status < 500) {
    return { category: "rejected", retryable: false, providerCode };
  }
  return { category: "unknown_outcome", retryable: false, providerCode };
}

export const RETRY_BASE_MS = 60_000;
export const RETRY_MAX_MS = 30 * 60_000;

/** Exponential backoff with full jitter in [50%, 100%] of the step. */
export function backoffDelayMs(attempt: number, random: () => number = Math.random): number {
  const step = Math.min(RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1), RETRY_MAX_MS);
  return Math.round(step * (0.5 + random() * 0.5));
}
