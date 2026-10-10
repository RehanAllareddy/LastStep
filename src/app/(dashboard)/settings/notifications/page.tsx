import type { Metadata } from "next";
import { requireOnboardedUser } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadNotificationState, preferencesToForm } from "@/lib/notifications/queries";
import { CONSENT_LABELS, type ConsentCategory } from "@/lib/consent/agreements";
import { supportedTimeZones } from "@/lib/time/zones";
import { formatDateTime } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { PhoneVerification } from "@/components/notifications/phone-verification";
import { ChannelConsent } from "@/components/notifications/channel-consent";
import { PreferencesForm } from "@/components/notifications/preferences-form";
import { ConsentDisclosure } from "@/components/notifications/consent-disclosure";

export const metadata: Metadata = { title: "Notification Settings" };

const EVENT_LABEL: Record<string, string> = {
  sent: "Sent to provider",
  status_delivered: "Delivered",
  status_failed: "Delivery failed",
  failed: "Failed",
  retry: "Will retry",
  deferred: "Deferred (quiet hours)",
  skipped: "Skipped",
  canceled: "Canceled",
  consent_granted: "Consent given",
  consent_revoked: "Consent revoked",
  opt_out: "Opted out (STOP)",
  opt_in: "Resubscribed (START)",
  completion_sent: "Completion message",
  summary_sent: "Morning summary",
};

export default async function NotificationSettingsPage() {
  const { user, profile } = await requireOnboardedUser();
  const env = serverEnv();
  const state = await loadNotificationState(user.id);
  const supabase = await createSupabaseServerClient();
  const { data: events } = await supabase
    .from("notification_events")
    .select("id, channel, event_type, provider_status, occurred_at, metadata")
    .order("occurred_at", { ascending: false })
    .limit(40);
  const tz = profile.time_zone;
  const verified = Boolean(state.phone?.verified);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notification Settings"
        description="You're in control: what reaches you, when, and how often."
      />

      <Card>
        <CardHeader>
          <CardTitle>Phone number</CardTitle>
          <CardDescription>Reminders only go to a number you&apos;ve verified.</CardDescription>
        </CardHeader>
        <CardContent>
          <PhoneVerification
            currentMasked={state.phone?.masked ?? null}
            verified={verified}
            simulated={env.NOTIFICATION_PROVIDER === "simulated"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Channels and consent</CardTitle>
          <CardDescription>
            Consent is recorded separately for each channel. Reply STOP to any text to opt out instantly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <details className="bg-surface-muted/60 rounded-[12px] p-4">
            <summary className="cursor-pointer text-sm font-medium">Read the notification agreement</summary>
            <div className="mt-3">
              <ConsentDisclosure />
            </div>
          </details>
          <ChannelConsent
            channel="sms"
            phoneVerified={verified}
            available
            consent={state.smsConsent}
            enabled={Boolean(state.prefs?.sms_enabled)}
            grantedLabel={
              state.smsConsent ? formatDateTime(state.smsConsent.granted_at, tz, { year: "numeric" }) : null
            }
          />
          <ChannelConsent
            channel="voice"
            phoneVerified={verified}
            available={env.voiceConfigured}
            consent={state.voiceConsent}
            enabled={Boolean(state.prefs?.voice_calls_enabled)}
            grantedLabel={
              state.voiceConsent ? formatDateTime(state.voiceConsent.granted_at, tz, { year: "numeric" }) : null
            }
          />
          <div className="border-border text-muted-foreground rounded-[12px] border border-dashed p-4 text-sm">
            <span className="text-foreground font-medium">Marketing:</span> LastStep doesn&apos;t send marketing
            messages.
          </div>
        </CardContent>
      </Card>

      {state.prefs && (
        <Card>
          <CardHeader>
            <CardTitle>Reminder preferences</CardTitle>
            <CardDescription>Saving reschedules pending reminders for all open assignments.</CardDescription>
          </CardHeader>
          <CardContent>
            <PreferencesForm initial={preferencesToForm(state.prefs)} timeZones={supportedTimeZones()} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Notification history</CardTitle>
          <CardDescription>
            &quot;Sent&quot; means our provider accepted it — not necessarily that it was delivered or read.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!events?.length ? (
            <p className="text-muted-foreground text-sm">No notification activity yet.</p>
          ) : (
            <ul className="divide-border divide-y text-sm">
              {events.map((e) => {
                const meta = (e.metadata ?? {}) as Record<string, unknown>;
                return (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span className="flex items-center gap-2">
                      {e.channel && <Badge tone="outline">{e.channel === "sms" ? "Text" : "Call"}</Badge>}
                      {EVENT_LABEL[e.event_type] ?? e.event_type}
                      {typeof meta.reason === "string" && (
                        <span className="text-muted-foreground">· {meta.reason.replace(/_/g, " ")}</span>
                      )}
                      {meta.simulated === true && <Badge tone="warning">Simulated</Badge>}
                    </span>
                    <span className="text-muted-foreground">{formatDateTime(e.occurred_at, tz)}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {state.consentHistory.length > 0 && (
            <details className="mt-4">
              <summary className="text-muted-foreground cursor-pointer text-sm">
                Consent record ({state.consentHistory.length})
              </summary>
              <ul className="text-muted-foreground mt-2 space-y-1.5 text-[13px]">
                {state.consentHistory.map((c) => (
                  <li key={c.id}>
                    {CONSENT_LABELS[c.category as ConsentCategory]}: granted{" "}
                    {formatDateTime(c.granted_at, tz, { year: "numeric" })} via {c.consent_source} (v{" "}
                    {c.agreement_version})
                    {c.revoked_at && (
                      <>
                        {" "}
                        · revoked {formatDateTime(c.revoked_at, tz, { year: "numeric" })} via {c.revocation_source}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
