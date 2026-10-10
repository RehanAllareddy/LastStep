import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireOnboardedUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { allowedChannelsFor } from "@/lib/assignments/service";
import { getAssignment } from "@/lib/assignments/queries";
import { editDefaults } from "@/lib/assignments/form-defaults";
import { canEdit } from "@/lib/assignments/state-machine";
import { loadNotificationState } from "@/lib/notifications/queries";
import { supportedTimeZones } from "@/lib/time/zones";
import { PageHeader } from "@/components/layout/page-header";
import { AssignmentForm } from "@/components/assignments/assignment-form";

export const metadata: Metadata = { title: "Edit Assignment" };

export default async function EditAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireOnboardedUser();
  const a = await getAssignment(id);
  if (!a) notFound();
  if (!canEdit(a.status)) redirect(`/assignments/${id}`);
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
      <PageHeader
        title="Edit or reschedule"
        description="Changing the deadline cancels stale reminders and schedules new ones."
      />
      <AssignmentForm
        mode="edit"
        assignmentId={id}
        initial={editDefaults(a)}
        timeZones={supportedTimeZones()}
        channelsAvailable={available}
      />
    </div>
  );
}
