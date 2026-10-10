import { describe, expect, it } from "vitest";
import { isWithinQuietHours, quietPeriodEnd, quietPeriodStart } from "@/lib/time/quiet-hours";

const q = { start: "21:30", end: "08:00", timeZone: "America/New_York" };
const ny = (iso: string) => new Date(iso); // explicit UTC instants below

describe("quiet hours", () => {
  it("detects overnight windows", () => {
    expect(isWithinQuietHours(ny("2026-10-10T02:00:00Z"), q)).toBe(true); // 22:00 EDT
    expect(isWithinQuietHours(ny("2026-10-10T10:00:00Z"), q)).toBe(true); // 06:00 EDT
    expect(isWithinQuietHours(ny("2026-10-10T16:00:00Z"), q)).toBe(false); // 12:00 EDT
    expect(isWithinQuietHours(ny("2026-10-10T12:00:00Z"), q)).toBe(false); // 08:00 EDT boundary is allowed
  });
  it("supports same-day windows and disabled windows", () => {
    const day = { start: "13:00", end: "15:00", timeZone: "UTC" };
    expect(isWithinQuietHours(new Date("2026-10-10T14:00:00Z"), day)).toBe(true);
    expect(isWithinQuietHours(new Date("2026-10-10T15:00:00Z"), day)).toBe(false);
    expect(
      isWithinQuietHours(new Date("2026-10-10T14:00:00Z"), { start: "00:00", end: "00:00", timeZone: "UTC" }),
    ).toBe(false);
  });
  it("finds the end of the current quiet period", () => {
    expect(quietPeriodEnd(ny("2026-10-10T02:00:00Z"), q).toISOString()).toBe("2026-10-10T12:00:00.000Z"); // 22:00 -> next 08:00
    expect(quietPeriodEnd(ny("2026-10-10T10:00:00Z"), q).toISOString()).toBe("2026-10-10T12:00:00.000Z"); // 06:00 -> 08:00 same day
  });
  it("finds the start of the current quiet period", () => {
    expect(quietPeriodStart(ny("2026-10-10T10:00:00Z"), q).toISOString()).toBe("2026-10-10T01:30:00.000Z"); // previous 21:30 EDT
  });
});
