import "server-only";
import { inngest } from "./client";
import { dispatchNow, runMaintenance, runSummaries } from "@/lib/scheduler/run";

/**
 * Every minute: mark overdue assignments, claim due reminder jobs and
 * dispatch them. Jobs live in Postgres, so nothing is lost across deploys;
 * concurrency 1 plus row-level claiming prevents double dispatch.
 */
export const dispatchDueRemindersFn = inngest.createFunction(
  { id: "dispatch-due-reminders", triggers: [{ cron: "* * * * *" }], concurrency: { limit: 1 }, retries: 2 },
  async ({ step }) => {
    const summary = await step.run("dispatch", async () => {
      const s = await dispatchNow();
      return { overdueMarked: s.overdueMarked, claimed: s.claimed, outcomes: s.results.map((r) => r.outcome) };
    });
    return summary;
  },
);

export const dailyMaintenanceFn = inngest.createFunction(
  { id: "daily-maintenance", triggers: [{ cron: "TZ=UTC 15 4 * * *" }], retries: 3 },
  async ({ step }) => step.run("maintenance", () => runMaintenance()),
);

/** Hourly: morning summaries for users whose local time is 8 AM. */
export const morningSummariesFn = inngest.createFunction(
  { id: "morning-summaries", triggers: [{ cron: "TZ=UTC 0 * * * *" }], concurrency: { limit: 1 }, retries: 1 },
  async ({ step }) => step.run("summaries", () => runSummaries()),
);

export const functions = [dispatchDueRemindersFn, dailyMaintenanceFn, morningSummariesFn];
