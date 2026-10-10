import { defineConfig, devices } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";

// Same local env as the app (Supabase local defaults, PHONE_HASH_SECRET, CRON_SECRET).
const env: Record<string, string> = {};
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]!] = m[2]!;
  }
}
const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;
Object.assign(process.env, env, { NEXT_PUBLIC_APP_URL: BASE_URL });

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: BASE_URL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Production build in a separate dist dir, simulated notifications, test env.
    command: `npx next build && npx next start -p ${PORT}`,
    url: BASE_URL,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    env: {
      ...env,
      NEXT_PUBLIC_APP_URL: BASE_URL,
      NEXT_DIST_DIR: ".next-e2e",
      APP_ENV: "test",
      NOTIFICATION_PROVIDER: "simulated",
    },
  },
});
