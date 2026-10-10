import { test } from "@playwright/test";
import { seedUser, signIn, createAssignmentUI } from "./helpers";

// Captures key screens (light/dark, desktop/mobile) for manual design review.
test("capture screens", async ({ browser }) => {
  test.skip(!process.env.CAPTURE_SCREENS, "set CAPTURE_SCREENS=1 to capture");
  const u = await seedUser();
  for (const scheme of ["light", "dark"] as const) {
    for (const vp of [
      { name: "desktop", width: 1280, height: 860 },
      { name: "mobile", width: 390, height: 844 },
    ]) {
      const ctx = await browser.newContext({ colorScheme: scheme, viewport: vp });
      const page = await ctx.newPage();
      await page.goto("/");
      await page.screenshot({
        path: `test-results/screens/landing-${scheme}-${vp.name}.png`,
        fullPage: vp.name === "desktop",
      });
      await signIn(page, u.email, u.password);
      if (scheme === "light" && vp.name === "desktop") {
        await createAssignmentUI(page, "Lab report: enzyme kinetics");
        await createAssignmentUI(page, "Essay outline: The Great Gatsby");
      }
      for (const path of ["/dashboard", "/assignments/new", "/settings/notifications"]) {
        await page.goto(path);
        await page.screenshot({ path: `test-results/screens/${path.replace(/\//g, "_")}-${scheme}-${vp.name}.png` });
      }
      await ctx.close();
    }
  }
});
