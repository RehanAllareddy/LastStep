import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, Bell, CalendarDays, CheckCircle2, ListTodo, Plus, Sparkles } from "lucide-react";
import { requireOnboardedUser } from "@/lib/auth/session";
import { getOverview, nextRemindersFor } from "@/lib/assignments/queries";
import { formatDate, formatDateTime, greeting } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AssignmentCard } from "@/components/assignments/assignment-card";
import { EmptyState, PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Overview" };

function Stat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-[13px]">{label}</p>
        <Icon className={`size-4 ${tone ?? "text-subtle-foreground"}`} />
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
    </Card>
  );
}

export default async function OverviewPage() {
  const { profile } = await requireOnboardedUser();
  const tz = profile.time_zone;
  const o = await getOverview(tz);
  const serverNow = o.now.toISOString();
  const today = [...o.overdue, ...o.dueToday.filter((a) => a.status !== "overdue")];
  const reminders = await nextRemindersFor([...today, ...o.upcoming].map((a) => a.id));
  const nothingOpen = o.active.length + o.overdue.length + o.paused.length + o.inReview.length === 0;

  return (
    <>
      <PageHeader
        title={`${greeting(tz, o.now)}${profile.display_name ? `, ${profile.display_name}` : ""}`}
        description={formatDate(o.now, tz)}
        actions={
          <Button asChild>
            <Link href="/assignments/new">
              <Plus /> Create Assignment
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active" value={o.active.length} icon={ListTodo} />
        <Stat label="Due today" value={o.dueToday.length} icon={CalendarDays} tone="text-warning" />
        <Stat label="Overdue" value={o.overdue.length} icon={AlertCircle} tone="text-danger" />
        <Stat label="Recently completed" value={o.recentlyCompleted.length} icon={CheckCircle2} tone="text-success" />
      </div>

      <Card className="mt-4 flex items-center gap-3 p-4 text-sm">
        <Bell className="text-accent size-4 shrink-0" aria-hidden />
        {o.nextReminder ? (
          <p>
            Next reminder: <span className="font-medium">{o.nextReminder.channel === "voice" ? "call" : "text"}</span>{" "}
            {formatDateTime(o.nextReminder.scheduled_at, tz, { weekday: "short" })}
            {o.nextReminderTitle && (
              <>
                {" "}
                for <span className="font-medium">{o.nextReminderTitle}</span>
              </>
            )}
          </p>
        ) : (
          <p className="text-muted-foreground">
            No reminders scheduled.{" "}
            <Link href="/settings/notifications" className="text-accent hover:underline">
              Check notification settings
            </Link>
          </p>
        )}
      </Card>

      {nothingOpen ? (
        <div className="mt-8">
          <EmptyState
            icon={Sparkles}
            title="No open commitments"
            description="Create an assignment with a real deadline and LastStep will help you see it through."
            action={
              <Button asChild>
                <Link href="/assignments/new">
                  <Plus /> Create your first assignment
                </Link>
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
          <section aria-labelledby="today-heading" className="space-y-3">
            <h2 id="today-heading" className="text-base font-semibold tracking-tight">
              Today&apos;s Commitments
            </h2>
            {today.length === 0 ? (
              <p className="border-border-strong text-muted-foreground rounded-[var(--radius)] border border-dashed p-6 text-center text-sm">
                Nothing due today. Get ahead on something upcoming?
              </p>
            ) : (
              today.map((a) => (
                <AssignmentCard
                  key={a.id}
                  assignment={a}
                  nextReminder={reminders.get(a.id) ?? null}
                  serverNow={serverNow}
                  viewerTimeZone={tz}
                  href={`/assignments/${a.id}`}
                  actions={
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/assignments/${a.id}/submit`}>Submit work</Link>
                    </Button>
                  }
                />
              ))
            )}
            {o.upcoming.length > 0 && (
              <>
                <h2 className="pt-4 text-base font-semibold tracking-tight">Upcoming deadlines</h2>
                {o.upcoming.map((a) => (
                  <AssignmentCard
                    key={a.id}
                    assignment={a}
                    nextReminder={reminders.get(a.id) ?? null}
                    serverNow={serverNow}
                    viewerTimeZone={tz}
                    href={`/assignments/${a.id}`}
                  />
                ))}
              </>
            )}
          </section>
          <aside className="space-y-4">
            {o.inReview.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Awaiting review</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {o.inReview.map((a) => (
                    <Link key={a.id} href={`/assignments/${a.id}`} className="hover:text-accent block truncate">
                      {a.title}
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader>
                <CardTitle>Recently completed</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {o.recentlyCompleted.length === 0 ? (
                  <p className="text-muted-foreground">Finished work will show up here.</p>
                ) : (
                  o.recentlyCompleted.map((a) => (
                    <div key={a.id} className="flex items-start gap-2">
                      <CheckCircle2 className="text-success mt-0.5 size-4 shrink-0" aria-hidden />
                      <div className="min-w-0">
                        <Link href={`/assignments/${a.id}`} className="hover:text-accent block truncate font-medium">
                          {a.title}
                        </Link>
                        {a.completed_at && (
                          <p className="text-muted-foreground text-xs">{formatDateTime(a.completed_at, tz)}</p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
            {o.paused.length > 0 && (
              <p className="text-muted-foreground text-sm">
                {o.paused.length} paused assignment{o.paused.length === 1 ? "" : "s"} —{" "}
                <Link href="/assignments?filter=paused" className="text-accent hover:underline">
                  view
                </Link>
              </p>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
