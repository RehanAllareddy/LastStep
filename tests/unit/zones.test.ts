import { describe, expect, it } from "vitest";
import { addDaysToDateString, isValidTimeZone, localDateString, localParts, localToUtc } from "@/lib/time/zones";

describe("localToUtc", () => {
  it("converts New York wall time in winter (EST, UTC-5)", () => {
    const r = localToUtc("2026-01-15", "23:59", "America/New_York");
    expect(r.ok && r.instant.toISOString()).toBe("2026-01-16T04:59:00.000Z");
  });
  it("converts New York wall time in summer (EDT, UTC-4)", () => {
    const r = localToUtc("2026-07-01", "09:00", "America/New_York");
    expect(r.ok && r.instant.toISOString()).toBe("2026-07-01T13:00:00.000Z");
  });
  it("handles zones with non-hour offsets", () => {
    const r = localToUtc("2026-03-01", "12:00", "Asia/Kolkata");
    expect(r.ok && r.instant.toISOString()).toBe("2026-03-01T06:30:00.000Z");
  });
  it("rejects times skipped by spring-forward DST", () => {
    // 2026-03-08 02:30 does not exist in New York.
    expect(localToUtc("2026-03-08", "02:30", "America/New_York")).toEqual({
      ok: false,
      reason: "nonexistent_local_time",
    });
  });
  it("resolves ambiguous fall-back times to the earlier instant", () => {
    const r = localToUtc("2026-11-01", "01:30", "America/New_York");
    expect(r.ok && r.instant.toISOString()).toBe("2026-11-01T05:30:00.000Z"); // EDT occurrence
  });
  it("rejects invalid input", () => {
    expect(localToUtc("2026-02-30", "10:00", "UTC")).toEqual({ ok: false, reason: "invalid_format" });
    expect(localToUtc("2026-02-10", "25:00", "UTC")).toEqual({ ok: false, reason: "invalid_format" });
    expect(localToUtc("2026-02-10", "10:00", "Mars/Base")).toEqual({ ok: false, reason: "invalid_time_zone" });
  });
});

describe("zone helpers", () => {
  it("validates IANA zones", () => {
    expect(isValidTimeZone("Europe/London")).toBe(true);
    expect(isValidTimeZone("Nowhere/City")).toBe(false);
  });
  it("computes local dates across the date line", () => {
    const instant = new Date("2026-05-01T20:00:00Z");
    expect(localDateString(instant, "Pacific/Auckland")).toBe("2026-05-02");
    expect(localDateString(instant, "America/Los_Angeles")).toBe("2026-05-01");
    expect(localParts(instant, "UTC").weekday).toBe(5);
  });
  it("adds days across month boundaries", () => {
    expect(addDaysToDateString("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDaysToDateString("2026-03-01", -1)).toBe("2026-02-28");
  });
});
