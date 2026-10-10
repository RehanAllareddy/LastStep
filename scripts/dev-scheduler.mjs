#!/usr/bin/env node
// Local scheduler loop: calls the protected dispatch endpoint every 60s, the way
// Inngest (or an external cron) does in production. Ctrl+C to stop.
import { readFileSync, existsSync } from "node:fs";

const env = { ...process.env };
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && env[m[1]] === undefined) env[m[1]] = m[2];
  }
}
const base = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
if (!env.CRON_SECRET) throw new Error("CRON_SECRET is not set");

async function tick(task) {
  const url = `${base}/api/internal/dispatch${task ? `?task=${task}` : ""}`;
  try {
    const res = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${env.CRON_SECRET}` } });
    console.log(new Date().toISOString(), task ?? "dispatch", res.status, await res.text());
  } catch (e) {
    console.error(new Date().toISOString(), "scheduler tick failed:", e.message);
  }
}

let n = 0;
await tick();
setInterval(() => {
  n++;
  void tick();
  if (n % 60 === 0) void tick("summaries");
}, 60_000);
