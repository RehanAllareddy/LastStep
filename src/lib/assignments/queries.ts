import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addDaysToDateString, instantAtLocal, localDateString } from "@/lib/time/zones";
import type { NextReminder } from "@/components/assignments/assignment-card";

const CARD_COLUMNS =
  "id, title, subject, due_at, time_zone, priority, status, estimated_minutes, created_at, completed_at, submitted_at";

export const FILTERS = [
  "all",
  "active",
  "due_today",
  "upcoming",
  "overdue",
  "submitted",
  "completed",
  "paused",
] as const;
export type AssignmentFilter = (typeof FILTERS)[number];
export const SORTS = ["deadline", "created", "priority"] as const;
export type AssignmentSort = (typeof SORTS)[number];
export const PAGE_SIZE = 20;

export function localDayBounds(timeZone: string, now = new Date()) {
  const today = localDateString(now, timeZone);
  return {
    start: instantAtLocal(today, "00:00", timeZone),
    end: instantAtLocal(addDaysToDateString(today, 1), "00:00", timeZone),
  };
}

/** Escape LIKE wildcards and PostgREST filter syntax in user search input. */
function searchPattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`).replace(/[,()]/g, " ")}%`;
}

export async function listAssignments(opts: {
  filter: AssignmentFilter;
  sort: AssignmentSort;
  q: string;
  page: number;
  timeZone: string;
}) {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("assignments").select(CARD_COLUMNS, { count: "exact" });
  const { start, end } = localDayBounds(opts.timeZone);
  switch (opts.filter) {
    case "all":
      query = query.neq("status", "canceled");
      break;
    case "active":
      query = query.eq("status", "active");
      break;
    case "due_today":
      query = query
        .gte("due_at", start.toISOString())
        .lt("due_at", end.toISOString())
        .in("status", ["active", "overdue", "paused", "submitted", "under_review", "completed"]);
      break;
    case "upcoming":
      query = query.eq("status", "active").gte("due_at", end.toISOString());
      break;
    case "overdue":
      query = query.eq("status", "overdue");
      break;
    case "submitted":
      query = query.in("status", ["submitted", "under_review"]);
      break;
    case "completed":
      query = query.eq("status", "completed");
      break;
    case "paused":
      query = query.eq("status", "paused");
      break;
  }
  const q = opts.q.trim().slice(0, 100);
  if (q) {
    const p = searchPattern(q);
    query = query.or(`title.ilike.${p},subject.ilike.${p}`);
  }
  if (opts.sort === "created") query = query.order("created_at", { ascending: false });
  else if (opts.sort === "priority")
    query = query.order("priority", { ascending: false }).order("due_at", { ascending: true });
  else query = query.order("due_at", { ascending: opts.filter !== "completed" });
  const from = (Math.max(1, opts.page) - 1) * PAGE_SIZE;
  const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error("Failed to load assignments");
  return { rows: data ?? [], total: count ?? 0 };
}

/** Earliest scheduled reminder per assignment (RLS-scoped). */
export async function nextRemindersFor(ids: string[]): Promise<Map<string, NextReminder>> {
  const map = new Map<string, NextReminder>();
  if (ids.length === 0) return map;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("reminder_jobs")
    .select("assignment_id, scheduled_at, channel")
    .in("assignment_id", ids)
    .eq("status", "scheduled")
    .order("scheduled_at", { ascending: true });
  for (const r of data ?? []) {
    if (!map.has(r.assignment_id)) map.set(r.assignment_id, { scheduled_at: r.scheduled_at, channel: r.channel });
  }
  return map;
}

export async function getOverview(timeZone: string) {
  const supabase = await createSupabaseServerClient();
  const now = new Date();
  const { start, end } = localDayBounds(timeZone, now);
  const [open, recent, nextJob] = await Promise.all([
    supabase
      .from("assignments")
      .select(CARD_COLUMNS)
      .in("status", ["active", "overdue", "paused", "submitted", "under_review"])
      .order("due_at"),
    supabase
      .from("assignments")
      .select(CARD_COLUMNS)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(5),
    supabase
      .from("reminder_jobs")
      .select("scheduled_at, channel, assignment_id")
      .eq("status", "scheduled")
      .order("scheduled_at")
      .limit(1)
      .maybeSingle(),
  ]);
  const rows = open.data ?? [];
  const dueToday = rows.filter((a) => {
    const t = new Date(a.due_at).getTime();
    return t >= start.getTime() && t < end.getTime();
  });
  return {
    now,
    active: rows.filter((a) => a.status === "active"),
    overdue: rows.filter((a) => a.status === "overdue"),
    dueToday,
    upcoming: rows.filter((a) => a.status === "active" && new Date(a.due_at).getTime() >= end.getTime()).slice(0, 5),
    inReview: rows.filter((a) => a.status === "submitted" || a.status === "under_review"),
    paused: rows.filter((a) => a.status === "paused"),
    recentlyCompleted: recent.data ?? [],
    nextReminder: nextJob.data ?? null,
    nextReminderTitle: nextJob.data ? (rows.find((a) => a.id === nextJob.data!.assignment_id)?.title ?? null) : null,
  };
}

export async function getAssignment(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("assignments").select("*").eq("id", id).maybeSingle();
  return data;
}

export async function getAssignmentDetail(id: string) {
  const supabase = await createSupabaseServerClient();
  const [assignment, jobs, submissions, events] = await Promise.all([
    supabase.from("assignments").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("reminder_jobs")
      .select("id, channel, kind, scheduled_at, status, sent_at, cancel_reason, failure_category, simulated")
      .eq("assignment_id", id)
      .order("scheduled_at", { ascending: true })
      .limit(60),
    supabase
      .from("submissions")
      .select("id, status, submitted_at, reviewed_at, deleted_at, self_attested, review_note")
      .eq("assignment_id", id)
      .order("submitted_at", { ascending: false }),
    supabase
      .from("assignment_events")
      .select("id, from_status, to_status, actor, created_at")
      .eq("assignment_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  return {
    assignment: assignment.data,
    jobs: jobs.data ?? [],
    submissions: submissions.data ?? [],
    events: events.data ?? [],
  };
}
