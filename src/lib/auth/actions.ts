"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/consent/agreements";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { clientIp } from "@/lib/security/request";
import { isValidTimeZone } from "@/lib/time/zones";
import { forgotPasswordSchema, resetPasswordSchema, signInSchema, signUpSchema } from "@/lib/validation/auth";
import { fail, fieldErrorsFrom, type ActionResult } from "@/lib/validation/common";
import { userMessage } from "@/lib/db/errors";

/** Only allow same-site relative redirects. */
function safeNext(next: unknown, fallback = "/dashboard"): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : fallback;
}

export async function signUpAction(input: unknown): Promise<ActionResult<{ email: string }>> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success)
    return fail("Please fix the highlighted fields.", "validation", fieldErrorsFrom(parsed.error.issues));
  const v = parsed.data;
  try {
    await enforceRateLimit(`auth:ip:${await clientIp()}`, RATE_LIMITS.authAttemptPerIp);
  } catch (error) {
    return fail(userMessage(error), "rate_limited");
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email: v.email,
    password: v.password,
    options: {
      emailRedirectTo: `${publicEnv().NEXT_PUBLIC_APP_URL}/auth/confirm?next=/onboarding`,
      data: {
        display_name: v.displayName,
        time_zone: isValidTimeZone(v.timeZone) ? v.timeZone : "UTC",
        terms_version: TERMS_VERSION,
        privacy_version: PRIVACY_VERSION,
        age_confirmed: "true",
      },
    },
  });
  if (error) {
    if (error.code === "weak_password")
      return fail("Choose a stronger password.", "weak_password", { password: "Choose a stronger password" });
    if (error.status === 429) return fail("Too many attempts. Please wait and try again.", "rate_limited");
    // Never reveal whether an email is already registered.
    if (error.code !== "user_already_exists") return fail("We couldn't create your account. Please try again.");
  }
  return { ok: true, data: { email: v.email } };
}

export async function signInAction(input: unknown, next?: string): Promise<ActionResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success)
    return fail("Please fix the highlighted fields.", "validation", fieldErrorsFrom(parsed.error.issues));
  try {
    await enforceRateLimit(`auth:ip:${await clientIp()}`, RATE_LIMITS.authAttemptPerIp);
  } catch (error) {
    return fail(userMessage(error), "rate_limited");
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      return fail("Confirm your email first. Check your inbox for the link we sent.", "email_not_confirmed");
    }
    return fail("Incorrect email or password.", "invalid_credentials");
  }
  redirect(safeNext(next));
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function forgotPasswordAction(input: unknown): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return fail("Enter a valid email.", "validation", fieldErrorsFrom(parsed.error.issues));
  try {
    await enforceRateLimit(`auth:ip:${await clientIp()}`, RATE_LIMITS.authAttemptPerIp);
  } catch (error) {
    return fail(userMessage(error), "rate_limited");
  }
  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${publicEnv().NEXT_PUBLIC_APP_URL}/auth/confirm?next=/reset-password`,
  });
  // Same response whether or not the account exists.
  return { ok: true, data: undefined };
}

export async function resetPasswordAction(input: unknown): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success)
    return fail("Please fix the highlighted fields.", "validation", fieldErrorsFrom(parsed.error.issues));
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return fail("Your reset link expired. Request a new one.", "no_session");
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") return fail("Choose a password you haven't used here before.", "same_password");
    return fail("We couldn't update your password. Request a new link and try again.");
  }
  return { ok: true, data: undefined };
}
