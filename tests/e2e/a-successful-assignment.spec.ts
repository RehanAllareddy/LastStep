import { expect, test } from "@playwright/test";
import { admin, confirmationLink, jobsFor, pngFile, randomPhone } from "./helpers";

test("Scenario A: register, onboard, commit, submit proof, reminders canceled", async ({ page, context }) => {
  const email = `e2e-a-${Date.now()}@example.test`;

  // Landing -> sign up (welcome step, then account creation)
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Stop scrolling.");
  await page.getByRole("link", { name: "Start Your First Commitment" }).click();
  await page.getByRole("button", { name: "Create my account" }).click();
  await page.getByLabel("Preferred name").fill("Avery");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("a-very-strong-passphrase");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("You must confirm you meet the age requirement")).toBeVisible(); // unchecked by default
  await page.getByRole("checkbox", { name: /I am 13 or older/ }).click();
  await page.getByRole("checkbox", { name: /I agree to the/ }).click();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  // Email verification through the local mail catcher
  await page.goto(await confirmationLink(email));
  await expect(page).toHaveURL(/\/onboarding/);

  // Phone verification (simulated provider writes the code to the dev outbox)
  const phone = randomPhone();
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("Verification code")).toBeVisible(); // action finished
  const outbox = await context.newPage();
  await outbox.goto("/dev/outbox");
  await expect(outbox.getByText("SIMULATED — nothing here was sent")).toBeVisible();
  const code = /code is (\d{6})/.exec(await outbox.locator("li").first().innerText())![1]!;
  await outbox.close();
  await page.getByLabel("Verification code").fill(code);
  await page.getByRole("button", { name: "Verify" }).click();

  // Separate, unchecked consent controls
  await expect(page.getByRole("heading", { name: "Notification agreement" })).toBeVisible();
  const sms = page.getByRole("checkbox", { name: /SMS accountability reminders/ });
  await expect(sms).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Agree to selected" })).toBeDisabled();
  await sms.click();
  await page.getByRole("button", { name: "Agree to selected" }).click();

  // Preferences -> dashboard
  await expect(page.getByRole("heading", { name: "Set your preferences" })).toBeVisible();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Avery");

  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const userId = users.users.find((u) => u.email === email)!.id;
  await admin
    .from("notification_preferences")
    .update({ quiet_hours_start: "00:00", quiet_hours_end: "00:00" })
    .eq("user_id", userId);
  const consents = (
    await admin
      .from("notification_consents")
      .select("category, consent_status, agreement_version, metadata")
      .eq("user_id", userId)
  ).data!;
  expect(consents).toHaveLength(1);
  expect(consents[0]).toMatchObject({ category: "sms_reminders", consent_status: "granted" });

  // Create an assignment with a future deadline (default: tomorrow 11:59 PM)
  await page.getByRole("link", { name: "Create Assignment" }).first().click();
  await page.getByLabel("Assignment title").fill("World history essay");
  await expect(page.getByRole("checkbox", { name: /Text messages/ })).toBeChecked();
  await page.getByRole("button", { name: "Create commitment" }).click();
  await expect(page.getByRole("heading", { name: "World history essay" })).toBeVisible();
  const assignmentId = page.url().split("/assignments/")[1]!;
  await expect(page.getByText("At deadline")).toBeVisible();
  const scheduled = (await jobsFor(assignmentId)).filter((j) => j.status === "scheduled");
  expect(scheduled.length).toBeGreaterThan(0);

  // Appears on the dashboard
  await page.getByRole("link", { name: "Overview" }).first().click();
  await expect(page.getByRole("link", { name: "World history essay" }).first()).toBeVisible();

  // Upload proof
  await page.goto(`/assignments/${assignmentId}/submit`);
  await page.getByLabel("Choose screenshot").setInputFiles(await pngFile());
  await expect(page.getByAltText("Preview of your screenshot")).toBeVisible();
  const submit = page.getByRole("button", { name: "Submit work" });
  await expect(submit).toBeDisabled(); // attestation required first
  await page.getByRole("checkbox", { name: /I confirm this assignment is complete/ }).click();
  await submit.click();
  await expect(page.getByRole("heading", { name: "Submission accepted" })).toBeVisible();
  await expect(page.getByText(new RegExp(`${scheduled.length} pending reminders? (was|were) canceled`))).toBeVisible();

  // Completion state + pending reminders canceled
  const a = (await admin.from("assignments").select("status").eq("id", assignmentId).single()).data!;
  expect(a.status).toBe("completed");
  const after = await jobsFor(assignmentId);
  expect(after.filter((j) => j.status === "scheduled")).toEqual([]);
  expect(after.every((j) => j.status === "canceled" && j.cancel_reason === "submitted")).toBe(true);

  await page.goto("/completed");
  await expect(page.getByRole("link", { name: "World history essay" })).toBeVisible();
  const evidence = await page.request.get(
    `/api/submissions/${(await admin.from("submissions").select("id").eq("assignment_id", assignmentId).single()).data!.id}/evidence`,
    { maxRedirects: 0 },
  );
  expect(evidence.status()).toBe(302);
  expect(evidence.headers().location).toContain("token=");
});
