import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { phoneHash } from "@/lib/security/phone";
import { TERMS_VERSION, agreementVersionFor } from "@/lib/consent/agreements";

export type Client = SupabaseClient<Database>;

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = () => (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;

export function adminClient(): Client {
  return createClient<Database>(url(), process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  client: Client;
}

const created: string[] = [];

export async function createTestUser(
  admin: Client,
  opts: { timeZone?: string; onboarded?: boolean } = {},
): Promise<TestUser> {
  const email = `test-${randomUUID().slice(0, 8)}@example.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: "Test Student",
      time_zone: opts.timeZone ?? "America/New_York",
      terms_version: TERMS_VERSION,
      age_confirmed: "true",
    },
  });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  created.push(data.user.id);
  if (opts.onboarded !== false)
    await admin.from("profiles").update({ onboarding_completed: true }).eq("id", data.user.id);
  const client = createClient<Database>(url(), anon(), { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, email, password, client };
}

/** Marks a phone as verified through the same SQL path the app uses. */
export async function verifyPhone(admin: Client, userId: string, e164 = randomPhone()) {
  const { data: vid, error } = await admin.rpc("create_phone_verification", {
    p_user_id: userId,
    p_phone_e164: e164,
    p_phone_hash: phoneHash(e164),
    p_code_hash: "",
    p_ttl_seconds: 600,
  });
  if (error) throw error;
  const approved = await admin.rpc("approve_phone_verification", { p_user_id: userId, p_verification_id: vid! });
  if (approved.error) throw approved.error;
  return e164;
}

export async function grantConsent(
  admin: Client,
  userId: string,
  category: "sms_reminders" | "voice_reminders" = "sms_reminders",
) {
  const { error } = await admin.rpc("record_consent", {
    p_user_id: userId,
    p_category: category,
    p_grant: true,
    p_agreement_version: agreementVersionFor(category),
    p_source: "onboarding",
    p_metadata: {},
  });
  if (error) throw error;
}

/** Fully reachable SMS user: verified phone + consent + sms_enabled. */
export async function createSmsUser(admin: Client, opts: { timeZone?: string } = {}) {
  const user = await createTestUser(admin, opts);
  const phone = await verifyPhone(admin, user.id);
  await grantConsent(admin, user.id);
  // Quiet hours off by default in tests so wall-clock time can't flake them.
  await admin
    .from("notification_preferences")
    .update({ quiet_hours_start: "00:00", quiet_hours_end: "00:00", max_daily_notifications: 12 })
    .eq("user_id", user.id);
  return { ...user, phone };
}

export function randomPhone(): string {
  // +1 555 01xx numbers are reserved for fiction; libphonenumber treats 201-555 as valid US.
  return `+1201555${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;
}

export async function cleanupUsers(admin: Client) {
  while (created.length) {
    const id = created.pop()!;
    await admin.auth.admin.deleteUser(id).catch(() => undefined);
  }
}

export function captureSink() {
  const sent: { user_id: string | null; channel: string; to_masked: string; body: string; kind: string | null }[] = [];
  return { sent, sink: async (row: (typeof sent)[number]) => void sent.push(row) };
}

/** Makes a job due now (simulates time passing) without touching anything else. */
export async function makeDue(admin: Client, jobId: string, minutesAgo = 1) {
  const at = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const { error } = await admin
    .from("reminder_jobs")
    .update({ scheduled_at: at, original_scheduled_at: at })
    .eq("id", jobId);
  if (error) throw error;
}

export function futureForm(over: Record<string, unknown> = {}) {
  const due = new Date(Date.now() + 5 * 24 * 3600_000);
  const date = due.toISOString().slice(0, 10);
  return {
    title: "Integration essay",
    description: "",
    subject: "English",
    dueDate: date,
    dueTime: "15:00",
    timeZone: "UTC",
    priority: "normal" as const,
    estimatedMinutes: "",
    reminderIntensity: "standard" as const,
    channels: ["sms" as const],
    commitment: "",
    completionPolicy: "self_attested" as const,
    recoveryDueDate: "",
    recoveryDueTime: "",
    ...over,
  };
}

export async function tinyPng(): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp({ create: { width: 120, height: 80, channels: 3, background: "#3d4bf5" } })
    .png()
    .toBuffer();
}
