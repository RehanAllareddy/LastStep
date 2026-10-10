import { describe, expect, it } from "vitest";
import { backoffDelayMs, classifyProviderError, ProviderError, RETRY_MAX_MS } from "@/lib/scheduler/retry";

describe("classifyProviderError", () => {
  it("retries only when the provider provably did not accept the request", () => {
    expect(classifyProviderError(new ProviderError("x", 429))).toMatchObject({
      category: "rate_limited",
      retryable: true,
    });
    expect(classifyProviderError(new ProviderError("x", 503))).toMatchObject({
      category: "provider_unavailable",
      retryable: true,
    });
    expect(classifyProviderError(new ProviderError("x", undefined, undefined, "ECONNREFUSED"))).toMatchObject({
      category: "network_error",
      retryable: true,
    });
  });
  it("never retries ambiguous outcomes", () => {
    expect(classifyProviderError(new ProviderError("x", undefined, undefined, "ETIMEDOUT"))).toMatchObject({
      category: "unknown_outcome",
      retryable: false,
    });
    expect(classifyProviderError(new ProviderError("x", 500))).toMatchObject({
      category: "unknown_outcome",
      retryable: false,
    });
    expect(classifyProviderError(new Error("boom"))).toMatchObject({ category: "unknown_outcome", retryable: false });
  });
  it("recognizes opt-outs and invalid numbers", () => {
    expect(classifyProviderError(new ProviderError("x", 400, 21610))).toMatchObject({
      category: "opted_out",
      retryable: false,
    });
    expect(classifyProviderError(new ProviderError("x", 400, 21211))).toMatchObject({
      category: "invalid_number",
      retryable: false,
    });
    expect(classifyProviderError(new ProviderError("x", 401, 20003))).toMatchObject({
      category: "provider_auth",
      retryable: false,
    });
  });
});

describe("backoffDelayMs", () => {
  it("grows exponentially with jitter and is capped", () => {
    expect(backoffDelayMs(1, () => 1)).toBe(60_000);
    expect(backoffDelayMs(2, () => 1)).toBe(120_000);
    expect(backoffDelayMs(3, () => 0)).toBe(120_000);
    expect(backoffDelayMs(20, () => 1)).toBe(RETRY_MAX_MS);
  });
});
