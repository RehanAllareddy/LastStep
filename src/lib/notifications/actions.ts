"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AppError, toAppError, userMessage } from "@/lib/db/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { auditMetadata } from "@/lib/security/request";
import { agreementVersionFor, MARKETING_MESSAGING_IMPLEMENTED } from "@/lib/consent/agreements";
import { rescheduleUserAssignments } from "@/lib/scheduler/sync";
import { isValidTimeZone } from "@/lib/time/zones";
import { consentChangeSchema, phoneCheckSchema, phoneStartSchema, preferencesSchema } from "@/lib/validation/settings";
import { fail, fieldErrorsFrom, type ActionResult } from "@/lib/validation/common";
import { verificationProvider } from "./index";
import { checkPhoneVerification, startPhoneVerification } from "./phone-verification";
import { maskPhone } from "@/lib/security/phone";

function revalidateSettings() {
  revalidatePath("/settings/notifications");
  revalidatePath("/settings/account");
  revalidatePath("/onboarding");
  revalidatePath("/dashboard");
}

export async function startPhoneVerificationAction(input: unknown): Promise<ActionResult<{ masked: string }>> {
  const user = await requireUser();
  const parsed = phoneStartSchema.safeParse(input);
  if (!parsed.success) return fail("Enter your phone number.", "validation", fieldErrorsFrom(parsed.error.issues));
  try {
    const { e164 } = await startPhoneVerification(supabaseAdmin(), verificationProvider(), user.id, parsed.data.phone);
    return { ok: true, data: { masked: maskPhone(e164) } };
  } catch (error) {
    return fail(userMessage(error), error instanceof AppError ? error.code : "internal", { phone: userMessage(error) });
  }
}

export async function checkPhoneVerificationAction(input: unknown): Promise<ActionResult<{ masked: string }>> {
  const user = await requireUser();
  const parsed = phoneCheckSchema.safeParse(input);
  if (!parsed.success) return fail("Enter the code we sent.", "validation", fieldErrorsFrom(parsed.error.issues));
  try {
    const contact = await checkPhoneVerification(supabaseAdmin(), verificationProvider(), user.id, parsed.data.code);
    revalidateSettings();
    return { ok: true, data: { masked: maskPhone(contact.normalized_value) } };
  } catch (error) {
    return fail(userMessage(error), error instanceof AppError ? error.code : "internal", { code: userMessage(error) });
  }
}

export async function removePhoneAction(): Promise<ActionResult> {
  const user = await requireUser();
  const { error } = await supabaseAdmin().rpc("remove_phone", { p_user_id: user.id });
  if (error) return fail(userMessage(toAppError(error)));
  revalidateSettings();
  return { ok: true, data: undefined };
}

/** Grants or revokes one consent category. Revocation takes effect server-side immediately. */
export async function changeConsentAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = consentChangeSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request.", "validation");
  const { category, grant, source } = parsed.data;
  if (category === "marketing" && grant && !MARKETING_MESSAGING_IMPLEMENTED) {
    return fail("LastStep doesn't send marketing messages.", "not_offered");
  }
  try {
    await enforceRateLimit(`consent:${user.id}`, RATE_LIMITS.consentChange);
    const db = supabaseAdmin();
    const { error } = await db.rpc("record_consent", {
      p_user_id: user.id,
      p_category: category,
      p_grant: grant,
      p_agreement_version: agreementVersionFor(category),
      p_source: source,
      p_metadata: await auditMetadata(),
    });
    if (error) throw toAppError(error);
    await rescheduleUserAssignments(db, user.id);
    revalidateSettings();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(userMessage(error), error instanceof AppError ? error.code : "internal");
  }
}

/** Pause/resume a channel without revoking consent. Turning on requires active consent. */
export async function setChannelEnabledAction(input: {
  channel: "sms" | "voice";
  enabled: boolean;
}): Promise<ActionResult> {
  const user = await requireUser();
  if (!input || !["sms", "voice"].includes(input.channel) || typeof input.enabled !== "boolean")
    return fail("Invalid request.");
  const db = supabaseAdmin();
  try {
    await enforceRateLimit(`prefs:${user.id}`, RATE_LIMITS.preferencesChange);
    if (input.enabled) {
      const category = input.channel === "sms" ? "sms_reminders" : "voice_reminders";
      const { data } = await db
        .from("notification_consents")
        .select("id")
        .eq("user_id", user.id)
        .eq("category", category)
        .eq("consent_status", "granted")
        .maybeSingle();
      if (!data) return fail("Give consent for this channel first.", "no_consent");
    }
    const patch = input.channel === "sms" ? { sms_enabled: input.enabled } : { voice_calls_enabled: input.enabled };
    const { error } = await db.from("notification_preferences").update(patch).eq("user_id", user.id);
    if (error) throw toAppError(error);
    await rescheduleUserAssignments(db, user.id);
    revalidateSettings();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(userMessage(error));
  }
}

export async function updatePreferencesAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success)
    return fail("Please fix the highlighted fields.", "validation", fieldErrorsFrom(parsed.error.issues));
  const v = parsed.data;
  if (!isValidTimeZone(v.timeZone))
    return fail("Choose a valid time zone.", "validation", { timeZone: "Choose a valid time zone" });
  const toNum = (s: string) => (s === "" ? null : Number(s));
  try {
    await enforceRateLimit(`prefs:${user.id}`, RATE_LIMITS.preferencesChange);
    const db = supabaseAdmin();
    const { error } = await db
      .from("notification_preferences")
      .update({
        time_zone: v.timeZone,
        quiet_hours_start: v.quietHoursStart,
        quiet_hours_end: v.quietHoursEnd,
        reminder_intensity: v.reminderIntensity,
        max_daily_notifications: v.maxDailyNotifications,
        summaries_enabled: v.summariesEnabled,
        completion_messages_enabled: v.completionMessagesEnabled,
        first_reminder_lead_hours: toNum(v.firstReminderLeadHours),
        follow_up_interval_hours: toNum(v.followUpIntervalHours),
        overdue_interval_hours: toNum(v.overdueIntervalHours),
        voice_call_lead_minutes: v.voiceCallLeadMinutes,
      })
      .eq("user_id", user.id);
    if (error) throw toAppError(error);
    await db.from("profiles").update({ time_zone: v.timeZone }).eq("id", user.id);
    // Rebuild every open plan so new quiet hours, caps and intervals apply.
    await rescheduleUserAssignments(db, user.id);
    revalidateSettings();
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(userMessage(error));
  }
}
