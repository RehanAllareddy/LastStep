/**
 * Time-zone helpers built on Intl (no wall-clock assumptions). Instants are
 * always JS Dates (UTC); "local" values are explicit {date, time} strings
 * interpreted in an IANA zone.
 */

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone || timeZone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function localParts(instant: Date, timeZone: string): LocalParts {
  const parts = formatter(timeZone).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: WEEKDAYS[get("weekday")] ?? 0,
  };
}

/** Offset of `timeZone` from UTC at `instant`, in milliseconds. */
export function zoneOffsetMs(instant: Date, timeZone: string): number {
  const p = localParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const truncated = Math.floor(instant.getTime() / 1000) * 1000;
  return asUtc - truncated;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export type LocalToUtcResult =
  | { ok: true; instant: Date }
  | { ok: false; reason: "invalid_format" | "invalid_time_zone" | "nonexistent_local_time" };

/**
 * Converts a local wall-clock date/time in `timeZone` to a UTC instant.
 * Times skipped by a DST transition are rejected rather than silently
 * shifted. Ambiguous times (DST fall-back) resolve to the earlier instant.
 */
export function localToUtc(date: string, time: string, timeZone: string): LocalToUtcResult {
  const d = DATE_RE.exec(date);
  const t = TIME_RE.exec(time);
  if (!d || !t) return { ok: false, reason: "invalid_format" };
  if (!isValidTimeZone(timeZone)) return { ok: false, reason: "invalid_time_zone" };

  const [y, mo, da] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [h, mi] = [Number(t[1]), Number(t[2])];
  const naive = Date.UTC(y, mo - 1, da, h, mi);
  const check = new Date(naive);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== da) {
    return { ok: false, reason: "invalid_format" };
  }

  // Try both candidate offsets (before/after a nearby transition) and keep
  // those that round-trip to the requested wall-clock time.
  const candidates = new Set<number>();
  for (const probe of [naive - 36e5 * 26, naive, naive + 36e5 * 26]) {
    candidates.add(naive - zoneOffsetMs(new Date(probe), timeZone));
  }
  const valid = [...candidates]
    .filter((ms) => {
      const p = localParts(new Date(ms), timeZone);
      return p.year === y && p.month === mo && p.day === da && p.hour === h && p.minute === mi;
    })
    .sort((a, b) => a - b);
  if (valid.length === 0) return { ok: false, reason: "nonexistent_local_time" };
  return { ok: true, instant: new Date(valid[0]!) };
}

/** Local calendar date (YYYY-MM-DD) of an instant in a zone. */
export function localDateString(instant: Date, timeZone: string): string {
  const p = localParts(instant, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function localTimeString(instant: Date, timeZone: string): string {
  const p = localParts(instant, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function addDaysToDateString(date: string, days: number): string {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error("invalid date");
  const base = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(base.getUTCDate())}`;
}

/**
 * Instant of a local wall-clock time on a local date, tolerating DST gaps by
 * moving forward minute-by-minute (used for quiet-hour boundaries, where a
 * slightly later boundary is the safe direction).
 */
export function instantAtLocal(date: string, time: string, timeZone: string): Date {
  const r = localToUtc(date, time, timeZone);
  if (r.ok) return r.instant;
  if (r.reason !== "nonexistent_local_time") throw new Error(`instantAtLocal: ${r.reason}`);
  const [h, m] = time.split(":").map(Number) as [number, number];
  for (let add = 1; add <= 180; add++) {
    const total = h * 60 + m + add;
    const next = `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
    const retry = localToUtc(date, next, timeZone);
    if (retry.ok) return retry.instant;
  }
  throw new Error("instantAtLocal: could not resolve local time");
}

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function minutesOfDay(time: string): number {
  const m = TIME_RE.exec(time);
  if (!m) throw new Error(`invalid time ${time}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** A curated list for pickers; any valid IANA zone is still accepted. */
export function supportedTimeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  const zones = intl.supportedValuesOf?.("timeZone") ?? [];
  return zones.length
    ? zones.includes("UTC")
      ? zones
      : ["UTC", ...zones]
    : ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London"];
}
