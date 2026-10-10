import { createHmac, randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import type { Database } from "../../src/types/database";

export const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
const MAILPIT = "http://127.0.0.1:54324";

export const randomPhone = () => `+1201555${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;
const phoneHash = (e164: string) =>
  createHmac("sha256", process.env.PHONE_HASH_SECRET!).update(`phone:${e164}`).digest("hex");

/** Creates a confirmed, onboarded user with verified phone + SMS consent via the app's SQL functions. */
export async function seedUser(opts: { sms?: boolean } = {}) {
  const email = `e2e-${randomUUID().slice(0, 8)}@example.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: "Robin",
      time_zone: "America/New_York",
      terms_version: "terms-2026-10-09-draft",
      age_confirmed: "true",
    },
  });
  if (error) throw error;
  const id = data.user!.id;
  await admin.from("profiles").update({ onboarding_completed: true }).eq("id", id);
  // Quiet hours off unless a test sets them, so wall-clock time can't flake runs.
  await admin
    .from("notification_preferences")
    .update({ quiet_hours_start: "00:00", quiet_hours_end: "00:00", max_daily_notifications: 12 })
    .eq("user_id", id);
  if (opts.sms !== false) {
    const phone = randomPhone();
    const { data: vid } = await admin.rpc("create_phone_verification", {
      p_user_id: id,
      p_phone_e164: phone,
      p_phone_hash: phoneHash(phone),
      p_code_hash: "",
      p_ttl_seconds: 600,
    });
    await admin.rpc("approve_phone_verification", { p_user_id: id, p_verification_id: vid! });
    const c = await admin.rpc("record_consent", {
      p_user_id: id,
      p_category: "sms_reminders",
      p_grant: true,
      p_agreement_version: "sms-2026-10-09-draft",
      p_source: "onboarding",
      p_metadata: {},
    });
    if (c.error) throw c.error;
  }
  return { id, email, password };
}

export async function signIn(page: Page, email: string, password: string) {
  // Every E2E sign-in comes from localhost; reset the per-IP auth limiter (test-only).
  await admin.from("rate_limit_hits").delete().like("bucket", "auth:ip:%");
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

export async function confirmationLink(email: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const body = (await res.json()) as { messages?: { ID: string }[] };
    const id = body.messages?.[0]?.ID;
    if (id) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as { HTML: string; Text: string };
      const m = /href="([^"]+)"/.exec(msg.HTML) ?? /(http\S+verify\S+)/.exec(msg.Text);
      if (m) return m[1]!.replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No confirmation email for ${email}`);
}

export async function jobsFor(assignmentId: string) {
  return (await admin.from("reminder_jobs").select("*").eq("assignment_id", assignmentId).order("scheduled_at")).data!;
}

export async function outboxFor(userId: string) {
  return (await admin.from("dev_outbox").select("*").eq("user_id", userId).neq("kind", "verification")).data!;
}

export async function makeDue(jobId: string) {
  const at = new Date(Date.now() - 60_000).toISOString();
  await admin.from("reminder_jobs").update({ scheduled_at: at, original_scheduled_at: at }).eq("id", jobId);
}

/** Runs one scheduler tick through the protected internal endpoint, like Vercel Cron / GitHub Actions would. */
export async function runScheduler(baseURL: string) {
  const res = await fetch(`${baseURL}/api/internal/dispatch`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(res.status).toBe(200);
  return res.json();
}

export async function pngFile() {
  const buffer = await sharp({ create: { width: 640, height: 400, channels: 3, background: "#e8f6ee" } })
    .png()
    .toBuffer();
  return { name: "finished-essay.png", mimeType: "image/png", buffer };
}

/** Creates an assignment through the UI and returns its id. */
export async function createAssignmentUI(page: Page, title: string) {
  await page.goto("/assignments/new");
  await page.getByLabel("Assignment title").fill(title);
  await page.getByLabel("Course or subject").fill("History");
  await page.getByRole("button", { name: "Create commitment" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  return page.url().split("/assignments/")[1]!.split(/[/?#]/)[0]!;
}
