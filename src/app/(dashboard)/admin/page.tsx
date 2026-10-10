import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { LimitsForm, RetryJobButton, ReviewButtons, RunSchedulerButton } from "@/components/dashboard/admin-controls";

export const metadata: Metadata = { title: "Operations" };

const iso = (s: string) => new Date(s).toISOString().replace("T", " ").slice(0, 16) + "Z";

function KV({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data);
  if (!entries.length) return <p className="text-muted-foreground text-sm">None</p>;
  return (
    <dl className="flex flex-wrap gap-2">
      {entries.map(([k, v]) => (
        <div key={k} className="bg-surface-muted rounded-md px-2 py-1 text-[13px]">
          <dt className="text-muted-foreground inline">{k}: </dt>
          <dd className="inline font-medium tabular-nums">{String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Operational tooling. Shows aggregates and job metadata only — no
 * assignment titles, phone numbers, or screenshots (reviewers see a pending
 * screenshot only via an audited, single-submission link).
 */
export default async function AdminPage() {
  const { roles } = await requireAdmin();
  const db = supabaseAdmin();
  const env = serverEnv();
  const isOps = roles.includes("ops");
  const isReviewer = roles.includes("reviewer");
  const [metrics, failed, webhooks, settings, audit, reviews] = await Promise.all([
    isOps ? db.rpc("admin_metrics") : Promise.resolve({ data: null }),
    isOps
      ? db
          .from("reminder_jobs")
          .select("id, channel, kind, failure_category, attempt_count, updated_at, provider_message_id")
          .eq("status", "failed")
          .order("updated_at", { ascending: false })
          .limit(25)
      : Promise.resolve({ data: [] }),
    isOps
      ? db
          .from("webhook_events")
          .select("id, provider, event_type, processing_status, error_category, received_at")
          .order("received_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
    isOps
      ? db.from("system_settings").select("value").eq("key", "reminder_limits").single()
      : Promise.resolve({ data: null }),
    db
      .from("admin_audit_log")
      .select("id, action, target_type, target_id, created_at")
      .order("created_at", { ascending: false })
      .limit(15),
    isReviewer
      ? db
          .from("submissions")
          .select("id, assignment_id, submitted_at")
          .eq("status", "pending_review")
          .is("deleted_at", null)
          .order("submitted_at")
          .limit(25)
      : Promise.resolve({ data: [] }),
  ]);
  const m = (metrics.data ?? {}) as Record<string, unknown>;
  const integrations = {
    APP_ENV: env.APP_ENV,
    provider: env.NOTIFICATION_PROVIDER,
    twilio_messaging: Boolean(env.TWILIO_MESSAGING_SERVICE_SID || env.TWILIO_FROM_NUMBER),
    twilio_verify: Boolean(env.TWILIO_VERIFY_SERVICE_SID),
    twilio_webhook_auth: Boolean(env.TWILIO_AUTH_TOKEN),
    voice: env.voiceConfigured,
    inngest_keys: Boolean(env.INNGEST_EVENT_KEY && env.INNGEST_SIGNING_KEY),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations"
        description={`Roles: ${roles.join(", ")}. All privileged actions are audited.`}
        actions={isOps ? <RunSchedulerButton /> : undefined}
      />
      {isOps && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Integration status</CardTitle>
            </CardHeader>
            <CardContent>
              <KV data={integrations} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Usage and delivery health</CardTitle>
              <CardDescription>Aggregates only.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <KV
                data={{
                  users: m.users_total,
                  onboarded: m.users_onboarded,
                  due_backlog: m.jobs_due_backlog,
                  suppressions: m.active_suppressions,
                  pending_reviews: m.pending_reviews,
                }}
              />
              <div>
                <p className="text-muted-foreground mb-1.5">Assignments by status</p>
                <KV data={(m.assignments_by_status ?? {}) as Record<string, unknown>} />
              </div>
              <div>
                <p className="text-muted-foreground mb-1.5">Reminder jobs (last 7 days)</p>
                <KV data={(m.jobs_last_7d_by_status ?? {}) as Record<string, unknown>} />
              </div>
              <div>
                <p className="text-muted-foreground mb-1.5">Failures by category (7 days)</p>
                <KV data={(m.failures_by_category ?? {}) as Record<string, unknown>} />
              </div>
              <div>
                <p className="text-muted-foreground mb-1.5">Webhooks (24h)</p>
                <KV data={(m.webhooks_last_24h ?? {}) as Record<string, unknown>} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Failed jobs</CardTitle>
              <CardDescription>
                Retry is offered only when the provider provably never received the request.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {!failed.data?.length ? (
                <p className="text-muted-foreground text-sm">No failed jobs.</p>
              ) : (
                <table className="w-full text-left text-[13px]">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="py-1.5 pr-3 font-medium">Job</th>
                      <th className="pr-3 font-medium">Channel / kind</th>
                      <th className="pr-3 font-medium">Category</th>
                      <th className="pr-3 font-medium">Attempts</th>
                      <th className="pr-3 font-medium">Updated</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {failed.data.map((j) => (
                      <tr key={j.id} className="border-border border-t">
                        <td className="py-1.5 pr-3 font-mono">{j.id.slice(0, 8)}</td>
                        <td className="pr-3">
                          {j.channel} / {j.kind}
                        </td>
                        <td className="pr-3">
                          <Badge tone="danger">{j.failure_category}</Badge>
                        </td>
                        <td className="pr-3 tabular-nums">{j.attempt_count}</td>
                        <td className="pr-3 tabular-nums">{iso(j.updated_at)}</td>
                        <td className="py-1.5 text-right">
                          {!j.provider_message_id && <RetryJobButton jobId={j.id} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Webhook processing</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {!webhooks.data?.length ? (
                <p className="text-muted-foreground text-sm">No webhooks received.</p>
              ) : (
                <table className="w-full text-left text-[13px]">
                  <tbody>
                    {webhooks.data.map((w) => (
                      <tr key={w.id} className="border-border border-t first:border-0">
                        <td className="py-1.5 pr-3">{w.provider}</td>
                        <td className="pr-3">{w.event_type}</td>
                        <td className="pr-3">
                          <Badge
                            tone={
                              w.processing_status === "failed"
                                ? "danger"
                                : w.processing_status === "processed"
                                  ? "success"
                                  : "neutral"
                            }
                          >
                            {w.processing_status}
                          </Badge>
                        </td>
                        <td className="pr-3">{w.error_category}</td>
                        <td className="tabular-nums">{iso(w.received_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
          {settings.data && (
            <Card>
              <CardHeader>
                <CardTitle>Global reminder limits</CardTitle>
              </CardHeader>
              <CardContent>
                <LimitsForm initial={settings.data.value as Record<string, number>} />
              </CardContent>
            </Card>
          )}
        </>
      )}
      {isReviewer && (
        <Card>
          <CardHeader>
            <CardTitle>Review queue</CardTitle>
            <CardDescription>
              Opening a screenshot is logged. Only submissions pending review are viewable.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!reviews.data?.length ? (
              <p className="text-muted-foreground text-sm">Nothing awaiting review.</p>
            ) : (
              reviews.data.map((s) => (
                <div
                  key={s.id}
                  className="border-border flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-[13px] first:border-0 first:pt-0"
                >
                  <span className="font-mono">
                    {s.id.slice(0, 8)} · {iso(s.submitted_at)}
                  </span>
                  <a
                    href={`/api/admin/submissions/${s.id}/evidence`}
                    target="_blank"
                    rel="noopener"
                    className="text-accent hover:underline"
                  >
                    View screenshot (audited)
                  </a>
                  <ReviewButtons submissionId={s.id} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Audit log</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-[13px]">
            {(audit.data ?? []).map((a) => (
              <li key={a.id} className="tabular-nums">
                <span className="text-muted-foreground">{iso(a.created_at)}</span> {a.action}{" "}
                {a.target_type && (
                  <span className="text-muted-foreground">
                    {a.target_type}:{a.target_id?.slice(0, 8)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
