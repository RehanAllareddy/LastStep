/** Display helpers. All take explicit time zones; nothing relies on the server's zone. */

export function formatDateTime(iso: string | Date, timeZone: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...opts,
  }).format(new Date(iso));
}

export function formatDate(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", month: "long", day: "numeric" }).format(
    new Date(iso),
  );
}

/** "in 3h 20m", "2d left", "overdue by 5h". Returns null for invalid input. */
export function relativeDeadline(
  dueIso: string,
  now: Date = new Date(),
): { label: string; overdue: boolean; ms: number } | null {
  const due = new Date(dueIso).getTime();
  if (Number.isNaN(due)) return null;
  const ms = due - now.getTime();
  const abs = Math.abs(ms);
  const mins = Math.floor(abs / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  const span = days >= 2 ? `${days}d` : hours >= 1 ? `${hours}h ${mins % 60}m` : `${Math.max(mins, 1)}m`;
  return ms >= 0 ? { label: `${span} left`, overdue: false, ms } : { label: `Overdue by ${span}`, overdue: true, ms };
}

export function isSameLocalDay(a: Date, b: Date, timeZone: string): boolean {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(a) === f.format(b);
}

export function greeting(timeZone: string, now = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(now));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}
