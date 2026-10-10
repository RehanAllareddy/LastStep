import { supabaseAdmin } from "@/lib/supabase/admin";
import { SMS_AGREEMENT_VERSION } from "@/lib/consent/agreements";
import { parseKeyword } from "@/lib/notifications/keywords";
import {
  claimWebhookEvent,
  completeWebhookEvent,
  twimlResponse,
  verifyTwilioWebhook,
} from "@/lib/notifications/webhooks";
import { normalizePhone, phoneHash } from "@/lib/security/phone";
import { rescheduleUserAssignments } from "@/lib/scheduler/sync";

/**
 * Inbound SMS. Handles STOP/START (and synonyms). Twilio's Advanced Opt-Out
 * sends the confirmation replies itself, so we answer with empty TwiML and
 * never send our own message in response to STOP.
 */
export async function POST(request: Request) {
  const verified = await verifyTwilioWebhook(request);
  if (!verified) return new Response("forbidden", { status: 403 });
  const { params } = verified;
  const db = supabaseAdmin();

  const messageSid = params.MessageSid ?? params.SmsSid;
  if (!messageSid) return twimlResponse();
  const claim = await claimWebhookEvent(db, "twilio", `inbound:${messageSid}`, "inbound_sms");
  if (claim.duplicate) return twimlResponse();

  try {
    const action = parseKeyword(params.Body, params.OptOutType);
    const from = normalizePhone(params.From ?? "");
    if (!action || action === "help" || !from.ok) {
      await completeWebhookEvent(db, claim.id, "ignored");
      return twimlResponse();
    }
    const { data: users, error } = await db.rpc("process_inbound_keyword", {
      p_phone_hash: phoneHash(from.e164),
      p_keyword: action,
      p_agreement_version: SMS_AGREEMENT_VERSION,
    });
    if (error) throw error;
    if (action === "start") {
      for (const userId of users ?? []) await rescheduleUserAssignments(db, userId);
    }
    await completeWebhookEvent(db, claim.id, "processed");
    return twimlResponse();
  } catch {
    // Marked failed (visible to ops); a provider retry will re-process it.
    await completeWebhookEvent(db, claim.id, "failed", "processing_error");
    return new Response("error", { status: 500 });
  }
}
