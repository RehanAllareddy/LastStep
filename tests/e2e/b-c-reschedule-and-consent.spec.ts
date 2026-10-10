import { expect, test } from "@playwright/test";
import { admin, createAssignmentUI, jobsFor, makeDue, outboxFor, runScheduler, seedUser, signIn } from "./helpers";

test("Scenario B: changing the deadline cancels old reminders and schedules new ones", async ({ page }) => {
  const u = await seedUser();
  await signIn(page, u.email, u.password);
  const id = await createAssignmentUI(page, "Biology lab report");
  const before = await jobsFor(id);
  expect(before.filter((j) => j.status === "scheduled").length).toBeGreaterThan(0);

  await page.getByRole("link", { name: "Edit / reschedule" }).click();
  const newDate = new Date(Date.now() + 4 * 86400_000).toISOString().slice(0, 10);
  await page.getByLabel("Due date").fill(newDate);
  await page.getByLabel("Due time").fill("17:00");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Biology lab report" })).toBeVisible();

  const after = await jobsFor(id);
  const oldIds = new Set(before.map((j) => j.id));
  expect(
    after.filter((j) => oldIds.has(j.id)).every((j) => j.status === "canceled" && j.cancel_reason === "rescheduled"),
  ).toBe(true);
  const fresh = after.filter((j) => !oldIds.has(j.id));
  expect(fresh.length).toBeGreaterThan(0);
  expect(fresh.every((j) => j.status === "scheduled" && j.schedule_version === 2)).toBe(true);
  const { data: a } = await admin.from("assignments").select("due_at").eq("id", id).single();
  // The new deadline is 5:00 PM New York time on the chosen date, and the due-time reminder lands exactly on it.
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(a!.due_at));
  expect(local).toBe(`${newDate}, 17:00`);
  const dueNow = fresh.find((j) => j.kind === "due_now");
  if (dueNow) expect(new Date(dueNow.scheduled_at).getTime()).toBe(new Date(a!.due_at).getTime());
  else expect(fresh.some((j) => j.kind === "before_deadline")).toBe(true); // moved earlier only if 5 PM fell in quiet hours
});

test("Scenario C: after revoking consent, a due reminder is not sent", async ({ page, baseURL }) => {
  const u = await seedUser();
  await signIn(page, u.email, u.password);
  const id = await createAssignmentUI(page, "Calculus problem set");
  const job = (await jobsFor(id)).find((j) => j.status === "scheduled")!;

  await page.goto("/settings/notifications");
  await page.getByRole("button", { name: "Revoke consent" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByText("Consent revoked. Pending reminders canceled.")).toBeVisible();
  expect((await jobsFor(id)).filter((j) => j.status === "scheduled")).toEqual([]);

  // Simulate a stale/raced job that is still marked scheduled and now due, then run the scheduler.
  await admin
    .from("reminder_jobs")
    .update({ status: "scheduled", cancel_reason: null, canceled_at: null })
    .eq("id", job.id);
  await makeDue(job.id);
  await runScheduler(baseURL!);
  const after = (await admin.from("reminder_jobs").select("status, cancel_reason").eq("id", job.id).single()).data!;
  expect(after.status).toBe("canceled");
  expect(await outboxFor(u.id)).toEqual([]);
});
