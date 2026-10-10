#!/usr/bin/env node
// Grant an operations role to an existing user (audited).
//   npm run admin:grant -- you@example.com ops|reviewer
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = { ...process.env };
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && env[m[1]] === undefined) env[m[1]] = m[2];
  }
}
const [email, role] = process.argv.slice(2);
if (!email || !["ops", "reviewer"].includes(role)) {
  console.error("Usage: npm run admin:grant -- <email> <ops|reviewer>");
  process.exit(1);
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
let user;
for (let page = 1; !user; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (data.users.length < 1000) break;
}
if (!user) {
  console.error(`No user with email ${email}`);
  process.exit(1);
}
const { error } = await db.from("app_admins").upsert({ user_id: user.id, role, granted_by: "cli" });
if (error) throw error;
await db
  .from("admin_audit_log")
  .insert({
    actor_id: null,
    action: "admin.grant",
    target_type: "user",
    target_id: user.id,
    metadata: { role, via: "cli" },
  });
console.log(`Granted ${role} to ${email}`);
