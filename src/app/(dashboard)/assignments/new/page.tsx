import type { Metadata } from "next";
import { requireOnboardedUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { allowedChannelsFor } from "@/lib/assignments/service";
import { newAssignmentDefaults } from "@/lib/assignments/form-defaults";
import { loadNotificationState } from "@/lib/notifications/queries";
import { supportedTimeZones } from "@/lib/time/zones";
import { PageHeader } from "@/components/layout/page-header";
import { AssignmentForm } from "@/components/assignments/assignment-form";

export const metadata: Metadata = { title: "Create Assignment" };

export default async function NewAssignmentPage() {
  const { user, profile } = await requireOnboardedUser();
  const [channels, state] = await Promise.all([
    allowedChannelsFor(supabaseAdmin(), user.id),
    loadNotificationState(user.id),
  ]);
  const available = {
    sms: channels.includes("sms") && Boolean(state.prefs?.sms_enabled),
    voice: channels.includes("voice") && Boolean(state.prefs?.voice_calls_enabled),
  };
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Create Assignment" description="Make a commitment with a real deadline." />
      <AssignmentForm
        mode="create"
        initial={newAssignmentDefaults(
          profile.time_zone,
          state.prefs?.reminder_intensity ?? "standard",
          available.sms ? ["sms"] : [],
        )}
        timeZones={supportedTimeZones()}
        channelsAvailable={available}
      />
    </div>
  );
}
