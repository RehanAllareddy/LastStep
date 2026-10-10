import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bell, Phone, Quote } from "lucide-react";
import { requireOnboardedUser } from "@/lib/auth/session";
import { getAssignmentDetail } from "@/lib/assignments/queries";
import { STATUS_LABELS } from "@/lib/assignments/state-machine";
import { formatDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { PriorityBadge, StatusBadge } from "@/components/assignments/status";
import { TimeLeft } from "@/components/assignments/relative-time";
import { LifecycleActions } from "@/components/assignments/lifecycle-actions";

export const metadata: Metadata = { title: "Assignment" };

const KIND_LABEL: Record<string, string> = {
  follow_up: "Check-in",
  before_deadline: "Before deadline",
  due_now: "At deadline",
  overdue: "Overdue follow-up",
  voice_call: "Voice call",
};
const JOB_TONE: Record<string, "neutral" | "accent" | "success" | "warning" | "danger"> = {
  scheduled: "accent",
  processing: "accent",
  sent: "success",
  delivered: "success",
  failed: "danger",
  canceled: "neutral",
  skipped: "neutral",
};
const REASON: Record<string, string> = {
  submitted: "work submitted",
  rescheduled: "rescheduled",
  paused: "paused",
  assignment_canceled: "assignment canceled",
  consent_revoked: "consent revoked",
  opt_out: "replied STOP",
  quiet_hours: "quiet hours",
  daily_limit: "daily limit reached",
  min_gap: "too soon after another",
  superseded: "replaced by a newer reminder",
  stale: "too late to be useful",
  not_active: "assignment not active",
  phone_changed: "phone number changed",
  channel_disabled: "channel turned off",
  no_consent: "no consent",
};

export default async function AssignmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile } = await requireOnboardedUser();
  const { assignment: a, jobs, submissions, events } = await getAssignmentDetail(id);
  if (!a) notFound();
  const tz = profile.time_zone;
  const open = a.status === "active" || a.status === "overdue";
  const upcoming = jobs.filter((j) => j.status === "scheduled");
  const past = jobs.filter((j) => j.status !== "scheduled").reverse();

  return (
    <div className="space-y-6">
      <Link
        href="/assignments"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> My Assignments
      </Link>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={a.status} />
          <PriorityBadge priority={a.priority} />
          {a.is_recovery_plan && <Badge tone="warning">Recovery plan</Badge>}
          {a.subject && <Badge tone="outline">{a.subject}</Badge>}
        </div>
        <h1 className="text-2xl font-semibold tracking-[-0.025em]">{a.title}</h1>
        <p className="text-muted-foreground text-sm">
          Due {formatDateTime(a.due_at, a.time_zone, { weekday: "long", timeZoneName: "short" })}
          {open && (
            <>
              {" "}
              · <TimeLeft dueAt={a.due_at} serverNow={new Date().toISOString()} className="font-medium" />
            </>
          )}
        </p>
        {a.is_recovery_plan && a.original_due_at && (
          <p className="text-muted-foreground text-[13px]">
            Original deadline: {formatDateTime(a.original_due_at, a.time_zone)}
          </p>
        )}
        <LifecycleActions id={a.id} status={a.status} />
      </div>

      {a.status === "under_review" && (
        <Alert tone="warning" title="Under review">
          Your screenshot is waiting for review. Reminders are stopped while it&apos;s reviewed. If it isn&apos;t
          accepted, the assignment reopens and reminders resume.
        </Alert>
      )}
      {a.status === "completed" && (
        <Alert tone="success" title="Completed">
          Nice work. All reminders for this assignment have stopped.
        </Alert>
      )}
      {a.status === "paused" && (
        <Alert tone="info" title="Paused">
          No reminders will be sent until you resume. You can still submit your work.
        </Alert>
      )}
      {a.status === "overdue" && (
        <Alert tone="danger" title="Past the deadline">
          It&apos;s not too late. Submit when you&apos;re done, or reschedule with a new deadline.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          {(a.description || a.commitment || a.estimated_minutes) && (
            <Card>
              <CardContent className="space-y-4 text-sm">
                {a.description && <p className="leading-relaxed whitespace-pre-wrap">{a.description}</p>}
                {a.commitment && (
                  <p className="bg-surface-muted text-muted-foreground flex gap-2 rounded-[10px] p-3 italic">
                    <Quote className="size-4 shrink-0" aria-hidden />
                    {a.commitment}
                  </p>
                )}
                {a.estimated_minutes && (
                  <p className="text-muted-foreground">Estimated: {a.estimated_minutes} minutes</p>
                )}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Reminder schedule</CardTitle>
            </CardHeader>
            <CardContent>
              {a.channels.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No reminder channels selected — tracked on your dashboard only.
                </p>
              ) : upcoming.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {open
                    ? "No upcoming reminders. Check that texts are enabled and consented in Notification Settings."
                    : "No upcoming reminders."}
                </p>
              ) : (
                <ul className="divide-border divide-y text-sm">
                  {upcoming.map((j) => (
                    <li key={j.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="flex items-center gap-2">
                        {j.channel === "voice" ? (
                          <Phone className="text-muted-foreground size-3.5" />
                        ) : (
                          <Bell className="text-muted-foreground size-3.5" />
                        )}
                        {KIND_LABEL[j.kind]}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {formatDateTime(j.scheduled_at, tz, { weekday: "short" })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {past.length > 0 && (
                <details className="mt-4">
                  <summary className="text-muted-foreground cursor-pointer text-sm">History ({past.length})</summary>
                  <ul className="divide-border mt-2 divide-y text-sm">
                    {past.map((j) => (
                      <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span>
                          {KIND_LABEL[j.kind]} · {formatDateTime(j.sent_at ?? j.scheduled_at, tz)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          {j.simulated && <Badge tone="warning">Simulated</Badge>}
                          <Badge tone={JOB_TONE[j.status]}>
                            {j.status}
                            {j.cancel_reason ? ` · ${REASON[j.cancel_reason] ?? j.cancel_reason}` : ""}
                          </Badge>
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Submissions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {submissions.length === 0 ? (
                <p className="text-muted-foreground">Nothing submitted yet.</p>
              ) : (
                submissions.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-muted-foreground">{formatDateTime(s.submitted_at, tz)}</span>
                    <span className="flex items-center gap-2">
                      <Badge
                        tone={s.status === "accepted" ? "success" : s.status === "rejected" ? "danger" : "warning"}
                      >
                        {s.status.replace("_", " ")}
                      </Badge>
                      {!s.deleted_at && (
                        <a
                          href={`/api/submissions/${s.id}/evidence`}
                          target="_blank"
                          rel="noopener"
                          className="text-accent hover:underline"
                        >
                          View
                        </a>
                      )}
                    </span>
                    {s.review_note && (
                      <p className="text-muted-foreground w-full text-[13px]">Reviewer note: {s.review_note}</p>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2.5 text-sm">
                {events.map((e) => (
                  <li key={e.id} className="flex justify-between gap-3">
                    <span>
                      {e.from_status ? `${STATUS_LABELS[e.from_status]} → ` : "Created as "}
                      {STATUS_LABELS[e.to_status]}
                    </span>
                    <span className="text-muted-foreground shrink-0">{formatDateTime(e.created_at, tz)}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
