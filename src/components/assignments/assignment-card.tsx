import Link from "next/link";
import { Bell, BellOff, CalendarClock, Phone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import type { AssignmentStatus } from "@/lib/assignments/state-machine";
import { PriorityBadge, StatusBadge } from "./status";
import { TimeLeft } from "./relative-time";

export interface AssignmentCardData {
  id: string;
  title: string;
  subject: string | null;
  due_at: string;
  time_zone: string;
  priority: "low" | "normal" | "high";
  status: AssignmentStatus;
  estimated_minutes: number | null;
}

export interface NextReminder {
  scheduled_at: string;
  channel: "sms" | "voice";
}

interface Props {
  assignment: AssignmentCardData;
  /** undefined = not loaded; null = none scheduled */
  nextReminder?: NextReminder | null;
  serverNow: string;
  viewerTimeZone: string;
  href?: string;
  actions?: React.ReactNode;
  className?: string;
}

const ACCENT_BAR: Partial<Record<AssignmentStatus, string>> = {
  overdue: "before:bg-danger",
  completed: "before:bg-success",
  active: "before:bg-accent",
  under_review: "before:bg-warning",
  submitted: "before:bg-accent",
};

export function AssignmentCard({
  assignment: a,
  nextReminder,
  serverNow,
  viewerTimeZone,
  href,
  actions,
  className,
}: Props) {
  const open = a.status === "active" || a.status === "overdue";
  const title = href ? (
    <Link href={href} className="hover:text-accent after:absolute after:inset-0 focus-visible:outline-none">
      {a.title}
    </Link>
  ) : (
    a.title
  );
  return (
    <Card
      className={cn(
        "has-[a:focus-visible]:outline-ring relative overflow-hidden p-4 pl-5 transition-shadow before:absolute before:inset-y-0 before:left-0 before:w-1 hover:shadow-[var(--shadow-raised)] has-[a:focus-visible]:outline-2 sm:p-5 sm:pl-6",
        ACCENT_BAR[a.status] ?? "before:bg-border-strong",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 space-y-1">
          {a.subject && (
            <p className="text-subtle-foreground text-xs font-medium tracking-wide uppercase">{a.subject}</p>
          )}
          <h3 className="truncate text-[15px] font-semibold tracking-tight">{title}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <PriorityBadge priority={a.priority} />
          <StatusBadge status={a.status} />
        </div>
      </div>
      <dl className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px]">
        <div className="text-muted-foreground flex items-center gap-1.5">
          <CalendarClock className="size-3.5" aria-hidden />
          <dt className="sr-only">Due</dt>
          <dd>{formatDateTime(a.due_at, viewerTimeZone, { weekday: "short" })}</dd>
        </div>
        {open && (
          <div>
            <dt className="sr-only">Time remaining</dt>
            <dd className="font-medium">
              <TimeLeft dueAt={a.due_at} serverNow={serverNow} />
            </dd>
          </div>
        )}
        {a.estimated_minutes && open && (
          <div className="text-muted-foreground">
            <dt className="sr-only">Estimated time</dt>
            <dd>
              ~
              {a.estimated_minutes >= 60
                ? `${Math.round((a.estimated_minutes / 60) * 10) / 10}h`
                : `${a.estimated_minutes}m`}{" "}
              of work
            </dd>
          </div>
        )}
        {open && nextReminder !== undefined && (
          <div className="text-muted-foreground flex items-center gap-1.5">
            <dt className="sr-only">Next reminder</dt>
            {nextReminder ? (
              <>
                {nextReminder.channel === "voice" ? (
                  <Phone className="size-3.5" aria-hidden />
                ) : (
                  <Bell className="size-3.5" aria-hidden />
                )}
                <dd>
                  Next {nextReminder.channel === "voice" ? "call" : "text"}{" "}
                  {formatDateTime(nextReminder.scheduled_at, viewerTimeZone)}
                </dd>
              </>
            ) : (
              <>
                <BellOff className="size-3.5" aria-hidden />
                <dd>No reminders scheduled</dd>
              </>
            )}
          </div>
        )}
      </dl>
      {actions && <div className="relative z-10 mt-4 flex flex-wrap gap-2">{actions}</div>}
    </Card>
  );
}
