import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { dispatchNow, runMaintenance, runSummaries } from "@/lib/scheduler/run";

/**
 * Alternative scheduler trigger for environments without Inngest (Vercel
 * Cron, GitHub Actions, pg_cron + pg_net, or `npm run scheduler:dev`).
 * Requires `Authorization: Bearer $CRON_SECRET`.
 */
function authorized(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${serverEnv().CRON_SECRET}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function handle(request: Request) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  if (url.searchParams.get("task") === "maintenance") {
    return Response.json(await runMaintenance());
  }
  if (url.searchParams.get("task") === "summaries") {
    return Response.json(await runSummaries());
  }
  const summary = await dispatchNow();
  return Response.json({
    overdueMarked: summary.overdueMarked,
    claimed: summary.claimed,
    outcomes: summary.results.map((r) => r.outcome),
  });
}

export const GET = handle;
export const POST = handle;
