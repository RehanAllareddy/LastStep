import { expect, test } from "@playwright/test";
import { admin, createAssignmentUI, pngFile, seedUser, signIn } from "./helpers";

test("Scenario D: one student cannot read or modify another student's data", async ({ browser }) => {
  const alice = await seedUser();
  const bob = await seedUser();

  const aliceCtx = await browser.newContext();
  const ap = await aliceCtx.newPage();
  await signIn(ap, alice.email, alice.password);
  const aliceAssignment = await createAssignmentUI(ap, "Alice private essay");
  const aliceSecond = await createAssignmentUI(ap, "Alice finished work");
  await ap.goto(`/assignments/${aliceSecond}/submit`);
  await ap.getByLabel("Choose screenshot").setInputFiles(await pngFile());
  await ap.getByRole("checkbox", { name: /I confirm/ }).click();
  await ap.getByRole("button", { name: "Submit work" }).click();
  await expect(ap.getByRole("heading", { name: "Submission accepted" })).toBeVisible();
  const submissionId = (await admin.from("submissions").select("id").eq("assignment_id", aliceSecond).single()).data!
    .id;

  const bobCtx = await browser.newContext();
  const bp = await bobCtx.newPage();
  await signIn(bp, bob.email, bob.password);
  await createAssignmentUI(bp, "Bob own essay");

  // Pages
  await bp.goto(`/assignments/${aliceAssignment}`);
  await expect(bp.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await bp.goto(`/assignments/${aliceAssignment}/edit`);
  await expect(bp.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await bp.goto("/assignments");
  await expect(bp.getByText("Alice private essay")).toHaveCount(0);

  // Evidence, upload, export
  expect((await bp.request.get(`/api/submissions/${submissionId}/evidence`, { maxRedirects: 0 })).status()).toBe(404);
  const upload = await bp.request.post(`/api/assignments/${aliceAssignment}/submissions`, {
    headers: { origin: new URL(bp.url()).origin },
    multipart: { file: await pngFile(), selfAttested: "true" },
  });
  expect(upload.status()).toBe(404);
  const csrf = await bp.request.post(`/api/assignments/${aliceAssignment}/submissions`, {
    headers: { origin: "https://evil.example" },
    multipart: { file: await pngFile(), selfAttested: "true" },
  });
  expect(csrf.status()).toBe(403);
  const exported = await (await bp.request.get("/api/account/export")).text();
  expect(exported).not.toContain("Alice");
  expect(exported).toContain("Bob own essay");
  // Operations tooling is role-gated: a student is sent back to their dashboard.
  await bp.goto("/admin");
  await expect(bp).toHaveURL(/\/dashboard$/);
  await expect(bp.getByText("Integration status")).toHaveCount(0);

  // Alice's data is untouched
  expect((await admin.from("assignments").select("status").eq("id", aliceAssignment).single()).data!.status).toBe(
    "active",
  );
  await aliceCtx.close();
  await bobCtx.close();
});
