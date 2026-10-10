import { supabaseAdmin } from "@/lib/supabase/admin";
import { SMS_AGREEMENT_VERSION } from "@/lib/consent/agreements";
import {
  claimWebhookEvent,
  completeWebhookEvent,
  normalizeTwilioStatus,
  verifyTwilioWebhook,
} from "@/lib/notifications/webhooks";
import { normalizePhone, phoneHash } from "@/lib/security/phone";

/** Message delivery-status callbacks. "sent" != delivered != read. */
export async function POST(request: Request) {
  const verified = await verifyTwilioWebhook(request);
  if (!verified) return new Response("forbidden", { status: 403 });
  const { params } = verified;
  const sid = params.MessageSid;
  const status = params.MessageStatus;
  if (!sid || !status) return new Response(null, { status: 204 });

  const db = supabaseAdmin();
  const claim = await claimWebhookEvent(db, "twilio", `status:${sid}:${status}`, "message_status");
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
  // 21610: recipient has opted out at the carrier/provider level.
  if (params.ErrorCode === "21610" && params.To) {
    const to = normalizePhone(params.To);
    if (to.ok) {
      await db.rpc("process_inbound_keyword", {
        p_phone_hash: phoneHash(to.e164),
        p_keyword: "stop",
        p_agreement_version: SMS_AGREEMENT_VERSION,
      });
    }
  }
  await completeWebhookEvent(db, claim.id, matched ? "processed" : "ignored");
  return new Response(null, { status: 204 });
}
