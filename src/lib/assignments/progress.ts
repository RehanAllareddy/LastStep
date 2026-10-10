import { addDaysToDateString, instantAtLocal, localDateString, localParts } from "@/lib/time/zones";

export interface ProgressRow {
  status: string;
  due_at: string;
  submitted_at: string | null;
  completed_at: string | null;
}

export interface ProgressStats {
  completedThisWeek: number;
  totalCompleted: number;
  /** completed ÷ assignments whose outcome is known (completed, or deadline passed). null when nothing qualifies. */
  completionRate: number | null;
  completionDenominator: number;
  /** completed with submitted_at ≤ due_at ÷ completed. null when nothing completed. */
  onTimeRate: number | null;
  weekly: { weekStart: string; label: string; completed: number }[];
}

/** Monday (local) of the week containing `instant`, as YYYY-MM-DD. */
export function weekStartDate(instant: Date, timeZone: string): string {
  const p = localParts(instant, timeZone);
  const offset = (p.weekday + 6) % 7; // Monday = 0
  return addDaysToDateString(localDateString(instant, timeZone), -offset);
}

/**
 * Transparent, non-manipulative progress metrics. Canceled assignments are
 * excluded everywhere. See the Progress page for the plain-language definitions.
 */
export function computeProgress(rows: ProgressRow[], timeZone: string, now = new Date(), weeks = 8): ProgressStats {
  const live = rows.filter((r) => r.status !== "canceled");
  const completed = live.filter((r) => r.status === "completed" && r.completed_at);
  const thisWeek = weekStartDate(now, timeZone);
  const weekStartInstant = instantAtLocal(thisWeek, "00:00", timeZone).getTime();

  const decided = live.filter((r) => r.status === "completed" || new Date(r.due_at).getTime() < now.getTime());
  const onTime = completed.filter(
    (r) => r.submitted_at && new Date(r.submitted_at).getTime() <= new Date(r.due_at).getTime(),
  );

  const weekly: ProgressStats["weekly"] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDaysToDateString(thisWeek, -7 * i);
    const [, m, d] = start.split("-").map(Number) as [number, number, number];
    weekly.push({
      weekStart: start,
      label: `${new Date(Date.UTC(2000, m - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" })} ${d}`,
      completed: 0,
    });
  }
  const index = new Map(weekly.map((w, i) => [w.weekStart, i]));
  for (const r of completed) {
    const i = index.get(weekStartDate(new Date(r.completed_at!), timeZone));
    if (i !== undefined) weekly[i]!.completed++;
  }

  return {
    completedThisWeek: completed.filter((r) => new Date(r.completed_at!).getTime() >= weekStartInstant).length,
    totalCompleted: completed.length,
    completionRate: decided.length ? completed.length / decided.length : null,
    completionDenominator: decided.length,
    onTimeRate: completed.length ? onTime.length / completed.length : null,
    weekly,
  };
}
