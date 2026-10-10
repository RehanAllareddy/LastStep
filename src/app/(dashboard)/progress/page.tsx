import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { requireOnboardedUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { computeProgress } from "@/lib/assignments/progress";
import { STATUS_LABELS } from "@/lib/assignments/state-machine";
import { formatDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/layout/page-header";
import { WeeklyChart } from "@/components/dashboard/weekly-chart";

export const metadata: Metadata = { title: "Progress" };

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

export default async function ProgressPage() {
  const { profile } = await requireOnboardedUser();
  const supabase = await createSupabaseServerClient();
  const [rows, events] = await Promise.all([
    supabase.from("assignments").select("id, title, status, due_at, submitted_at, completed_at"),
    supabase
      .from("assignment_events")
      .select("id, assignment_id, from_status, to_status, created_at, assignments(title)")
      .order("created_at", { ascending: false })
      .limit(12),
  ]);
  const data = rows.data ?? [];
  const tz = profile.time_zone;
  const s = computeProgress(data, tz);

  if (data.length === 0) {
    return (
      <>
        <PageHeader title="Progress" />
        <EmptyState
          icon={BarChart3}
          title="No progress to show yet"
          description="Once you create and finish assignments, your weekly trend and rates appear here — calculated only from your real activity."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Progress"
        description="Your follow-through, measured plainly. These numbers describe habits, not your worth."
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Completed this week", value: String(s.completedThisWeek) },
          { label: "Total completed", value: String(s.totalCompleted) },
          { label: "Completion rate", value: pct(s.completionRate) },
          { label: "On-time rate", value: pct(s.onTimeRate) },
        ].map((t) => (
          <Card key={t.label} className="p-4">
            <p className="text-muted-foreground text-[13px]">{t.label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{t.value}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Completed per week</CardTitle>
            <CardDescription>Last 8 weeks, weeks start Monday ({tz.replace(/_/g, " ")}).</CardDescription>
          </CardHeader>
          <CardContent>
            <WeeklyChart data={s.weekly} />
            <details className="mt-3 text-sm">
              <summary className="text-muted-foreground cursor-pointer">Show as table</summary>
              <table className="mt-2 w-full text-left text-[13px]">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="py-1 font-medium">Week of</th>
                    <th className="py-1 text-right font-medium">Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {s.weekly.map((w) => (
                    <tr key={w.weekStart} className="border-border border-t">
                      <td className="py-1">{w.label}</td>
                      <td className="py-1 text-right tabular-nums">{w.completed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm">
              {(events.data ?? []).map((e) => (
                <li key={e.id}>
                  <p className="truncate font-medium">
                    {(e.assignments as { title: string } | null)?.title ?? "Assignment"}
                  </p>
                  <p className="text-muted-foreground text-[13px]">
                    {e.from_status
                      ? `${STATUS_LABELS[e.from_status]} → ${STATUS_LABELS[e.to_status]}`
                      : `Created (${STATUS_LABELS[e.to_status]})`}{" "}
                    · {formatDateTime(e.created_at, tz)}
                  </p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>How these are calculated</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-2 text-sm">
          <p>
            <strong className="text-foreground">Completed this week:</strong> assignments marked completed since Monday
            12:00 AM in your time zone.
          </p>
          <p>
            <strong className="text-foreground">Completion rate:</strong> completed ÷ assignments whose outcome is known
            — those completed or whose deadline has passed ({s.completionDenominator} so far). Canceled assignments and
            ones not yet due are left out.
          </p>
          <p>
            <strong className="text-foreground">On-time rate:</strong> of completed assignments, the share submitted at
            or before the deadline (for recovery plans, the recovery target).
          </p>
          <p>No streaks, rankings, or comparisons with other students.</p>
        </CardContent>
      </Card>
    </>
  );
}
