import { expect, test } from "@playwright/test";
import { admin, createAssignmentUI, jobsFor, makeDue, outboxFor, runScheduler, seedUser, signIn } from "./helpers";

test("Scenario E: the same occurrence triggered concurrently sends one notification", async ({ page, baseURL }) => {
  const u = await seedUser();
  await signIn(page, u.email, u.password);
  const id = await createAssignmentUI(page, "Spanish vocab quiz prep");
  const job = (await jobsFor(id)).find((j) => j.status === "scheduled")!;
  await makeDue(job.id);
  await Promise.all(Array.from({ length: 6 }, () => runScheduler(baseURL!)));
  const sent = await outboxFor(u.id);
  expect(sent).toHaveLength(1);
  expect(sent[0]!.body).toContain("[SIMULATED SMS] LastStep");
  expect((await admin.from("reminder_jobs").select("status").eq("id", job.id).single()).data!.status).toBe("sent");
  await runScheduler(baseURL!);
  expect(await outboxFor(u.id)).toHaveLength(1);

  // The student can see it in their notification history, labeled simulated.
  await page.goto("/settings/notifications");
  await expect(page.getByText("Sent to provider").first()).toBeVisible();
  await expect(page.getByText("Simulated").first()).toBeVisible();
});

test("Scenario F: a reminder inside quiet hours is deferred, not sent", async ({ page, baseURL }) => {
  const u = await seedUser();
  await signIn(page, u.email, u.password);
  const id = await createAssignmentUI(page, "Physics reading");

  // Configure quiet hours covering the current time in the user's zone via the settings UI.
  const tz = "America/New_York";
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  await page.goto("/settings/notifications");
  await page.getByLabel("Time zone").selectOption(tz);
  await page.getByLabel("Quiet hours start").fill(fmt(new Date(Date.now() - 3600_000)));
  await page.getByLabel("Quiet hours end").fill(fmt(new Date(Date.now() + 2 * 3600_000)));
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Preferences saved.")).toBeVisible();

  // Make the earliest *pre-deadline* job due now and run the scheduler.
  const job = (await jobsFor(id)).filter((j) => j.status === "scheduled")[0]!;
  await makeDue(job.id);
  await runScheduler(baseURL!);
  const after = (await admin.from("reminder_jobs").select("status, scheduled_at").eq("id", job.id).single()).data!;
  expect(after.status).toBe("scheduled");
  expect(new Date(after.scheduled_at).getTime()).toBeGreaterThan(Date.now() + 60 * 60_000); // pushed to quiet-hours end
  expect(await outboxFor(u.id)).toEqual([]);
  const ev = (await admin.from("notification_events").select("event_type, metadata").eq("reminder_job_id", job.id))
    .data!;
  expect(ev).toEqual([expect.objectContaining({ event_type: "deferred" })]);
});
