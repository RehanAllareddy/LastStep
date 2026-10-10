import { addDaysToDateString, instantAtLocal, localDateString, localParts, minutesOfDay } from "./zones";

export interface QuietHours {
  start: string; // "HH:MM" local
  end: string; // "HH:MM" local
  timeZone: string;
}

/** start === end means quiet hours are disabled. Ranges may cross midnight. */
export function isWithinQuietHours(instant: Date, q: QuietHours): boolean {
  const s = minutesOfDay(q.start);
  const e = minutesOfDay(q.end);
  if (s === e) return false;
  const p = localParts(instant, q.timeZone);
  const m = p.hour * 60 + p.minute;
  return s < e ? m >= s && m < e : m >= s || m < e;
}

/** When the quiet period containing `instant` ends (or `instant` if not quiet). */
export function quietPeriodEnd(instant: Date, q: QuietHours): Date {
  if (!isWithinQuietHours(instant, q)) return instant;
  const s = minutesOfDay(q.start);
  const e = minutesOfDay(q.end);
  const p = localParts(instant, q.timeZone);
  const m = p.hour * 60 + p.minute;
  const today = localDateString(instant, q.timeZone);
  // Overnight window and we are in the evening part: ends tomorrow.
  const endDate = s > e && m >= s ? addDaysToDateString(today, 1) : today;
  return instantAtLocal(endDate, q.end, q.timeZone);
}

/** When the quiet period containing `instant` started (or `instant` if not quiet). */
export function quietPeriodStart(instant: Date, q: QuietHours): Date {
  if (!isWithinQuietHours(instant, q)) return instant;
  const s = minutesOfDay(q.start);
  const e = minutesOfDay(q.end);
  const p = localParts(instant, q.timeZone);
  const m = p.hour * 60 + p.minute;
  const today = localDateString(instant, q.timeZone);
  // Overnight window and we are in the early-morning part: started yesterday.
  const startDate = s > e && m < e ? addDaysToDateString(today, -1) : today;
  return instantAtLocal(startDate, q.start, q.timeZone);
}
