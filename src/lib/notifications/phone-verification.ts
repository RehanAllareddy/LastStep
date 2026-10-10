import "server-only";
import { AppError, toAppError } from "@/lib/db/errors";
import type { AdminClient } from "@/lib/supabase/admin";
import { normalizePhone, phoneHash } from "@/lib/security/phone";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { rescheduleUserAssignments } from "@/lib/scheduler/sync";
import { classifyProviderError } from "@/lib/scheduler/retry";
import type { VerificationProvider } from "./provider";

export const OTP_TTL_SECONDS = 600;

/**
 * Starts phone verification. The response never reveals whether the number
 * belongs to another account.
 */
export async function startPhoneVerification(
  db: AdminClient,
  provider: VerificationProvider,
  userId: string,
  rawPhone: string,
) {
  const parsed = normalizePhone(rawPhone);
  if (!parsed.ok) {
    throw new AppError(
      "invalid_phone",
      parsed.reason === "not_mobile"
        ? "That looks like a landline. Use a mobile number that can receive texts."
        : "Enter a valid phone number in international format, e.g. +1 555 123 4567.",
    );
  }
  const hash = phoneHash(parsed.e164);
  await enforceRateLimit(`otp-send:user:${userId}`, RATE_LIMITS.otpSendPerUser);
  await enforceRateLimit(`otp-send:phone:${hash}`, RATE_LIMITS.otpSendPerPhone);

  const { data: verificationId, error } = await db.rpc("create_phone_verification", {
    p_user_id: userId,
    p_phone_e164: parsed.e164,
    p_phone_hash: hash,
    p_code_hash: "",
    p_ttl_seconds: OTP_TTL_SECONDS,
  });
  if (error || !verificationId) throw toAppError(error);
  try {
    const { codeHash } = await provider.start({ to: parsed.e164, userId, verificationKey: verificationId });
    await db.from("phone_verifications").update({ code_hash: codeHash }).eq("id", verificationId);
  } catch (e) {
    await db.from("phone_verifications").update({ status: "failed" }).eq("id", verificationId);
    const failure = classifyProviderError(e);
    if (failure.category === "invalid_number")
      throw new AppError("invalid_phone", "That number can't receive verification texts.");
    throw new AppError("provider_error", "We couldn't send a code right now. Please try again in a few minutes.");
  }
  return { e164: parsed.e164 };
}

export async function checkPhoneVerification(
  db: AdminClient,
  provider: VerificationProvider,
  userId: string,
  code: string,
) {
  await enforceRateLimit(`otp-check:user:${userId}`, RATE_LIMITS.otpCheckPerUser);
  const { data, error } = await db.rpc("begin_phone_verification_attempt", { p_user_id: userId });
  if (error || !data) throw toAppError(error);
  const attempt = data as {
    status: "none" | "expired" | "locked" | "pending";
    id?: string;
    phone_e164?: string;
    code_hash?: string | null;
    attempts_remaining?: number;
  };
  if (attempt.status === "none") throw new AppError("no_verification", "Request a new code to continue.");
  if (attempt.status === "expired") throw new AppError("expired", "That code expired. Request a new one.");
  if (attempt.status === "locked") throw new AppError("locked", "Too many incorrect attempts. Request a new code.");

  let approved = false;
  try {
    approved = await provider.check({
      to: attempt.phone_e164!,
      code,
      verificationKey: attempt.id!,
      codeHash: attempt.code_hash || null,
    });
  } catch {
    throw new AppError("provider_error", "We couldn't check that code right now. Please try again.");
  }
  if (!approved) {
    const left = attempt.attempts_remaining ?? 0;
    throw new AppError(
      "wrong_code",
      left > 0
        ? `That code isn't right. ${left} attempt${left === 1 ? "" : "s"} left.`
        : "That code isn't right. Request a new code.",
    );
  }
  const { data: contact, error: approveError } = await db.rpc("approve_phone_verification", {
    p_user_id: userId,
    p_verification_id: attempt.id!,
  });
  if (approveError || !contact) throw toAppError(approveError);
  await rescheduleUserAssignments(db, userId);
  return contact;
}
