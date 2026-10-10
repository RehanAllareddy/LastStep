import { Inngest } from "inngest";

/**
 * Inngest drives the durable scheduler in production. In development, run
 * `npx inngest-cli@latest dev` (INNGEST_DEV=1) or use the cron endpoint.
 */
export const inngest = new Inngest({ id: "laststep" });
