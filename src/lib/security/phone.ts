import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { serverEnv } from "@/lib/env";

export type PhoneParseResult = { ok: true; e164: string } | { ok: false; reason: "invalid" | "not_mobile" };

/** Parse and normalize to E.164. Rejects numbers that can't receive SMS. */
export function normalizePhone(input: string): PhoneParseResult {
  const parsed = parsePhoneNumberFromString(input.trim());
  if (!parsed || !parsed.isValid()) return { ok: false, reason: "invalid" };
  const type = parsed.getType();
  if (type && !["MOBILE", "FIXED_LINE_OR_MOBILE", "PERSONAL_NUMBER"].includes(type)) {
    return { ok: false, reason: "not_mobile" };
  }
  return { ok: true, e164: parsed.number };
}

/** HMAC-SHA256 of an E.164 number; lets webhooks find a number without plaintext lookups. */
export function phoneHash(e164: string): string {
  return createHmac("sha256", serverEnv().PHONE_HASH_SECRET).update(`phone:${e164}`).digest("hex");
}

export function codeHash(verificationKey: string, code: string): string {
  return createHmac("sha256", serverEnv().PHONE_HASH_SECRET).update(`otp:${verificationKey}:${code}`).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb);
}

export function maskPhone(e164: string): string {
  return e164.length > 4 ? `${e164.slice(0, 2)}•••••${e164.slice(-4)}` : "•••";
}
