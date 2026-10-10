import type { Metadata } from "next";
import Link from "next/link";
import { ListTodo, Plus, Search } from "lucide-react";
import { requireOnboardedUser } from "@/lib/auth/session";
import {
  FILTERS,
  listAssignments,
  nextRemindersFor,
  PAGE_SIZE,
  SORTS,
  type AssignmentFilter,
  type AssignmentSort,
} from "@/lib/assignments/queries";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { AssignmentCard } from "@/components/assignments/assignment-card";
import { EmptyState, PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "My Assignments" };

const FILTER_LABELS: Record<AssignmentFilter, string> = {
  all: "All",
  active: "Active",
  due_today: "Due Today",
  upcoming: "Upcoming",
  overdue: "Overdue",
  submitted: "Submitted",
  completed: "Completed",
  paused: "Paused",
};

export default async function AssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { profile } = await requireOnboardedUser();
  const sp = await searchParams;
  const filter = (FILTERS as readonly string[]).includes(sp.filter ?? "") ? (sp.filter as AssignmentFilter) : "all";
  const sort = (SORTS as readonly string[]).includes(sp.sort ?? "") ? (sp.sort as AssignmentSort) : "deadline";
  const q = (sp.q ?? "").slice(0, 100);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const { rows, total } = await listAssignments({ filter, sort, q, page, timeZone: profile.time_zone });
  const reminders = await nextRemindersFor(
    rows.filter((r) => r.status === "active" || r.status === "overdue").map((r) => r.id),
  );
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (patch: Record<string, string | number>) => {
    const p = new URLSearchParams({ filter, sort, ...(q ? { q } : {}), page: String(page) });
    for (const [k, v] of Object.entries(patch)) p.set(k, String(v));
    return `/assignments?${p}`;
  };
  const serverNow = new Date().toISOString();

  return (
    <>
      <PageHeader
        title="My Assignments"
        description={`${total} assignment${total === 1 ? "" : "s"}`}
        actions={
          <Button asChild>
            <Link href="/assignments/new">
              <Plus /> Create Assignment
            </Link>
          </Button>
        }
      />
      <nav aria-label="Filter assignments" className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={href({ filter: f, page: 1 })}
            aria-current={f === filter ? "page" : undefined}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
              f === filter
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
            )}
          >
            {FILTER_LABELS[f]}
          </Link>
        ))}
      </nav>
      <form method="get" className="mb-6 flex flex-col gap-2 sm:flex-row" role="search">
        <input type="hidden" name="filter" value={filter} />
        <div className="relative flex-1">
          <Search
            className="text-subtle-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <label htmlFor="q" className="sr-only">
            Search assignments
          </label>
          <Input id="q" name="q" defaultValue={q} placeholder="Search by title or subject" className="pl-9" />
        </div>
        <label htmlFor="sort" className="sr-only">
          Sort by
        </label>
        <NativeSelect id="sort" name="sort" defaultValue={sort} className="sm:w-48">
          <option value="deadline">Sort: Deadline</option>
          <option value="created">Sort: Newest</option>
          <option value="priority">Sort: Priority</option>
        </NativeSelect>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title={q ? "No matches" : "Nothing here yet"}
          description={
            q
              ? `No assignments match "${q}".`
              : filter === "all"
                ? "Create your first assignment to get started."
                : `You have no ${FILTER_LABELS[filter].toLowerCase()} assignments.`
          }
          action={
            filter === "all" && !q ? (
              <Button asChild>
                <Link href="/assignments/new">
                  <Plus /> Create Assignment
                </Link>
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link href="/assignments">Show all</Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-3">
          {rows.map((a) => (
            <AssignmentCard
              key={a.id}
              assignment={a}
              nextReminder={reminders.get(a.id) ?? null}
              serverNow={serverNow}
              viewerTimeZone={profile.time_zone}
              href={`/assignments/${a.id}`}
            />
          ))}
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-8 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={href({ page: page - 1 })}>Previous</Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Button asChild variant="outline" size="sm">
              <Link href={href({ page: page + 1 })}>Next</Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
