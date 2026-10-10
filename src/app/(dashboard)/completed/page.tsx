import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { requireOnboardedUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/layout/page-header";
import { DeleteEvidenceButton } from "@/components/submissions/delete-evidence";

export const metadata: Metadata = { title: "Completed Work" };

export default async function CompletedPage() {
  const { profile } = await requireOnboardedUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("assignments")
    .select(
      "id, title, subject, due_at, completed_at, submitted_at, is_recovery_plan, submissions(id, status, submitted_at, deleted_at)",
    )
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(100);
  const tz = profile.time_zone;
  return (
    <>
      <PageHeader
        title="Completed Work"
        description="Everything you've closed the loop on. Screenshots are private to you."
      />
      {!data?.length ? (
        <EmptyState
          icon={CheckCircle2}
          title="Nothing completed yet"
          description="When you submit work for an assignment, it lands here."
          action={
            <Button asChild variant="outline">
              <Link href="/assignments">View assignments</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {data.map((a) => {
            const accepted = a.submissions.find((s) => s.status === "accepted");
            const onTime = a.submitted_at && new Date(a.submitted_at) <= new Date(a.due_at);
            return (
              <Card
                key={a.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
              >
                <div className="min-w-0">
                  {a.subject && (
                    <p className="text-subtle-foreground text-xs font-medium tracking-wide uppercase">{a.subject}</p>
                  )}
                  <Link
                    href={`/assignments/${a.id}`}
                    className="hover:text-accent block truncate font-semibold tracking-tight"
                  >
                    {a.title}
                  </Link>
                  <p className="text-muted-foreground mt-1 text-[13px]">
                    Completed {a.completed_at ? formatDateTime(a.completed_at, tz, { year: "numeric" }) : "—"} · Due{" "}
                    {formatDateTime(a.due_at, tz)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={onTime ? "success" : "neutral"}>{onTime ? "On time" : "Late"}</Badge>
                  {accepted && !accepted.deleted_at ? (
                    <>
                      <Button asChild variant="outline" size="sm">
                        <a href={`/api/submissions/${accepted.id}/evidence`} target="_blank" rel="noopener">
                          View screenshot <ExternalLink />
                        </a>
                      </Button>
                      <DeleteEvidenceButton submissionId={accepted.id} />
                    </>
                  ) : (
                    <span className="text-muted-foreground text-[13px]">Screenshot deleted</span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
