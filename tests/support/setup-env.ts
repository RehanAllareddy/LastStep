import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

// Load .env.local (local Supabase defaults) without overriding explicit env.
const file = path.resolve(__dirname, "../../.env.local");
if (existsSync(file)) {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2];
  }
}
process.env.APP_ENV ??= "test";
process.env.NOTIFICATION_PROVIDER ??= "simulated";
// A test-only token so webhook signature validation can be exercised end to end.
process.env.TWILIO_AUTH_TOKEN ??= "test_auth_token_for_signature_checks";
