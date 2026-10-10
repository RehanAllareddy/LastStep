import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  claimWebhookEvent,
  completeWebhookEvent,
  normalizeTwilioStatus,
  verifyTwilioWebhook,
} from "@/lib/notifications/webhooks";

/** Voice-call status callbacks (completed / busy / no-answer / failed). */
export async function POST(request: Request) {
  const verified = await verifyTwilioWebhook(request);
  if (!verified) return new Response("forbidden", { status: 403 });
  const { params } = verified;
  const sid = params.CallSid;
  const status = params.CallStatus;
  if (!sid || !status) return new Response(null, { status: 204 });

  const db = supabaseAdmin();
  const claim = await claimWebhookEvent(db, "twilio", `call:${sid}:${status}`, "call_status");
  if (claim.duplicate) return new Response(null, { status: 204 });

  const normalized = normalizeTwilioStatus(status);
  if (normalized === "other") {
    await completeWebhookEvent(db, claim.id, "ignored");
    return new Response(null, { status: 204 });
  }
  const { data: matched } = await db.rpc("record_delivery_status", {
    p_provider_message_id: sid,
    p_status: normalized,
    p_provider_status: status,
    p_error_code: params.ErrorCode || undefined,
  });
  await completeWebhookEvent(db, claim.id, matched ? "processed" : "ignored");
  return new Response(null, { status: 204 });
}
