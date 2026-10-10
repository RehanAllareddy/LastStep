"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";
import { isValidTimeZone } from "@/lib/time/zones";
import { profileSchema } from "@/lib/validation/settings";
import { fail, fieldErrorsFrom, type ActionResult } from "@/lib/validation/common";
import { userMessage } from "@/lib/db/errors";
import { deleteEvidence } from "@/lib/submissions/service";
import { deleteAccount } from "./deletion";
import { z } from "zod";

export async function updateProfileAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success)
    return fail("Please fix the highlighted fields.", "validation", fieldErrorsFrom(parsed.error.issues));
  if (!isValidTimeZone(parsed.data.timeZone))
    return fail("Choose a valid time zone.", "validation", { timeZone: "Choose a valid time zone" });
  // User-scoped client: column grants + RLS only permit these two fields on the caller's own row.
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data.displayName, time_zone: parsed.data.timeZone })
    .eq("id", user.id);
  if (error) return fail("We couldn't save your profile.");
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function changeEmailAction(input: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = z.object({ email: z.email("Enter a valid email") }).safeParse(input);
  if (!parsed.success) return fail("Enter a valid email.", "validation", fieldErrorsFrom(parsed.error.issues));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser(
    { email: parsed.data.email },
    { emailRedirectTo: `${publicEnv().NEXT_PUBLIC_APP_URL}/auth/confirm?next=/settings/account` },
  );
  if (error) return fail("We couldn't start the email change. Try again later.");
  return { ok: true, data: undefined };
}

export async function sendPasswordResetAction(): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.email) return fail("No email on file.");
  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(user.email, {
    redirectTo: `${publicEnv().NEXT_PUBLIC_APP_URL}/auth/confirm?next=/reset-password`,
  });
  return { ok: true, data: undefined };
}

export async function completeOnboardingAction(): Promise<void> {
  const user = await requireUser();
  await supabaseAdmin().from("profiles").update({ onboarding_completed: true }).eq("id", user.id);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function deleteEvidenceAction(submissionId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!z.uuid().safeParse(submissionId).success) return fail("Invalid request.");
  try {
    await deleteEvidence(supabaseAdmin(), user.id, submissionId);
    revalidatePath("/completed");
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(userMessage(error));
  }
}

export async function deleteAccountAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = z.object({ confirmation: z.literal("DELETE") }).safeParse(input);
  if (!parsed.success) return fail("Type DELETE to confirm.", "validation", { confirmation: "Type DELETE to confirm" });
  try {
    await deleteAccount(supabaseAdmin(), user.id);
  } catch {
    return fail("We couldn't finish deleting your account. Notifications are already stopped; please try again.");
  }
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut().catch(() => undefined);
  redirect("/?account=deleted");
}
