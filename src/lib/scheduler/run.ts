import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SMS_AGREEMENT_VERSION } from "@/lib/consent/agreements";
import { notificationProvider, statusCallbackUrl } from "@/lib/notifications";
import { serverEnv } from "@/lib/env";
import { removeEvidence } from "@/lib/storage/evidence";
import { dispatchDueReminders } from "./dispatcher";
import { createSupabaseReminderStore } from "./store";
import { sendMorningSummaries } from "@/lib/notifications/summaries";

/** Production wiring of the dispatcher (used by Inngest and the cron endpoint). */
export function dispatchNow(limit = 50) {
  const db = supabaseAdmin();
  return dispatchDueReminders(
    {
      store: createSupabaseReminderStore(db, SMS_AGREEMENT_VERSION),
      provider: notificationProvider(),
      statusCallbackUrl: (channel) =>
        statusCallbackUrl(channel === "sms" ? "/api/webhooks/twilio/status" : "/api/webhooks/twilio/voice-status"),
    },
    limit,
  );
}

/** Daily housekeeping: retention-based evidence expiry and operational log purge. */
export async function runMaintenance() {
  const db = supabaseAdmin();
  const { data: paths } = await db.rpc("expire_old_evidence", {
    p_retention_days: serverEnv().EVIDENCE_RETENTION_DAYS,
  });
  await removeEvidence(db, paths ?? []);
  await db.rpc("purge_operational_data");
  return { evidenceExpired: paths?.length ?? 0 };
}

export function runSummaries() {
  return sendMorningSummaries(supabaseAdmin(), notificationProvider());
}
