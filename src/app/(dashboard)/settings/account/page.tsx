import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { requireOnboardedUser } from "@/lib/auth/session";
import { loadNotificationState } from "@/lib/notifications/queries";
import { supportedTimeZones } from "@/lib/time/zones";
import { formatDateTime } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { DeleteAccountDialog, EmailForm, PasswordResetButton, ProfileForm } from "@/components/dashboard/account-forms";

export const metadata: Metadata = { title: "Account Settings" };

export default async function AccountSettingsPage() {
  const { user, profile } = await requireOnboardedUser();
  const state = await loadNotificationState(user.id);
  return (
    <div className="space-y-6">
      <PageHeader title="Account Settings" />
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm
            displayName={profile.display_name}
            timeZone={profile.time_zone}
            timeZones={supportedTimeZones()}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Email</CardTitle>
        </CardHeader>
        <CardContent>
          <EmailForm email={user.email} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Phone</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
          {state.phone ? (
            <span className="flex items-center gap-2 tabular-nums">
              {state.phone.masked}{" "}
              <Badge tone={state.phone.verified ? "success" : "warning"}>
                {state.phone.verified ? "Verified" : "Unverified"}
              </Badge>
            </span>
          ) : (
            <span className="text-muted-foreground">No phone number on file.</span>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/notifications">Manage phone & consent</Link>
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>We&apos;ll email a secure link to set a new password.</CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordResetButton />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Your data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <Button asChild variant="outline">
            <a href="/api/account/export">
              <Download /> Export my data (JSON)
            </a>
          </Button>
          <p className="text-muted-foreground">
            Terms accepted{" "}
            {profile.terms_accepted_at
              ? formatDateTime(profile.terms_accepted_at, profile.time_zone, { year: "numeric" })
              : "—"}{" "}
            (version {profile.terms_version ?? "—"}). Read the{" "}
            <Link href="/privacy" className="text-accent hover:underline">
              Privacy Policy
            </Link>
            ,{" "}
            <Link href="/terms" className="text-accent hover:underline">
              Terms of Service
            </Link>
            , and{" "}
            <Link href="/sms-terms" className="text-accent hover:underline">
              SMS Terms
            </Link>
            . Your notification agreement history is in{" "}
            <Link href="/settings/notifications" className="text-accent hover:underline">
              Notification Settings
            </Link>
            .
          </p>
        </CardContent>
      </Card>
      <Card className="border-danger/30">
        <CardHeader>
          <CardTitle>Delete account</CardTitle>
          <CardDescription>
            Stops all notifications, then deletes your screenshots and data. This can&apos;t be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteAccountDialog />
        </CardContent>
      </Card>
    </div>
  );
}
