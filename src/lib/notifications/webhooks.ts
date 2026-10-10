import "server-only";
import type { AdminClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";
import { validateTwilioSignature } from "./twilio";

export interface VerifiedTwilioRequest {
  params: Record<string, string>;
}

/**
 * Reads a Twilio form-encoded webhook and validates X-Twilio-Signature
 * against the public URL (NEXT_PUBLIC_APP_URL + path), since proxies may
 * rewrite the host the function sees.
 */
export async function verifyTwilioWebhook(request: Request): Promise<VerifiedTwilioRequest | null> {
  const form = await request.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") params[k] = v;
  const incoming = new URL(request.url);
  const publicUrl = new URL(incoming.pathname + incoming.search, publicEnv().NEXT_PUBLIC_APP_URL).toString();
  const ok = validateTwilioSignature(request.headers.get("x-twilio-signature"), publicUrl, params);
  return ok ? { params } : null;
}

export type WebhookClaim = { duplicate: true } | { duplicate: false; id: string };

/** Dedupes provider retries using a stable provider event id. */
export async function claimWebhookEvent(
  db: AdminClient,
  provider: string,
  eventId: string,
  eventType: string,
): Promise<WebhookClaim> {
  const { data, error } = await db
    .from("webhook_events")
    .insert({ provider, provider_event_id: eventId, event_type: eventType })
    .select("id")
    .single();
  if (error) {
    if (error.code !== "23505") throw new Error("webhook_events insert failed");
    // Already seen. Re-process only if the earlier attempt failed (provider retry).
    const { data: retry } = await db
      .from("webhook_events")
      .update({ processing_status: "received", error_category: null })
      .eq("provider", provider)
      .eq("provider_event_id", eventId)
      .eq("processing_status", "failed")
      .select("id")
      .maybeSingle();
    return retry ? { duplicate: false, id: retry.id } : { duplicate: true };
  }
  return { duplicate: false, id: data.id };
}

export async function completeWebhookEvent(
  db: AdminClient,
  id: string,
  status: "processed" | "ignored" | "failed",
  errorCategory?: string,
) {
  await db
    .from("webhook_events")
    .update({
      processing_status: status,
      processed_at: new Date().toISOString(),
      error_category: errorCategory ?? null,
    })
    .eq("id", id);
}

export const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

export function twimlResponse(body = EMPTY_TWIML, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/xml; charset=utf-8" } });
}

/** Maps Twilio message/call statuses to our delivery states. */
export function normalizeTwilioStatus(status: string): "sent" | "delivered" | "failed" | "other" {
  switch (status) {
    case "sent":
      return "sent";
    case "delivered":
    case "completed":
      return "delivered";
    case "undelivered":
    case "failed":
    case "busy":
    case "no-answer":
    case "canceled":
      return "failed";
    default:
      return "other";
  }
}
