import { z } from "zod";

/**
 * Environment configuration.
 *
 * Public values (NEXT_PUBLIC_*) are inlined into the browser bundle and must
 * never contain secrets. Server values are validated lazily on first use so
 * that `next build` does not require production secrets, while any request
 * that needs a missing value fails loudly instead of degrading silently.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
});

export type PublicEnv = z.infer<typeof publicSchema>;

let cachedPublic: PublicEnv | undefined;

export function publicEnv(): PublicEnv {
  if (cachedPublic) return cachedPublic;
  // Next.js only inlines NEXT_PUBLIC_* when accessed as literal properties.
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) {
    throw new Error(`Invalid public environment: ${formatIssues(parsed.error)}`);
  }
  cachedPublic = parsed.data;
  return cachedPublic;
}

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const serverSchema = z
  .object({
    APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
    SUPABASE_STORAGE_BUCKET: z.string().min(1).default("submissions"),
    PHONE_HASH_SECRET: z.string().min(32, "PHONE_HASH_SECRET must be at least 32 characters"),
    CRON_SECRET: z.string().min(32, "CRON_SECRET must be at least 32 characters"),
    NOTIFICATION_PROVIDER: z.enum(["twilio", "simulated"]).optional(),
    TWILIO_ACCOUNT_SID: optionalString,
    TWILIO_AUTH_TOKEN: optionalString,
    TWILIO_MESSAGING_SERVICE_SID: optionalString,
    TWILIO_FROM_NUMBER: optionalString,
    TWILIO_VERIFY_SERVICE_SID: optionalString,
    TWILIO_VOICE_FROM_NUMBER: optionalString,
    INNGEST_EVENT_KEY: optionalString,
    INNGEST_SIGNING_KEY: optionalString,
    EVIDENCE_RETENTION_DAYS: z.coerce.number().int().min(7).max(3650).default(365),
  })
  .transform((env, ctx) => {
    const provider = env.NOTIFICATION_PROVIDER ?? (env.APP_ENV === "production" ? undefined : "simulated");
    if (!provider) {
      ctx.addIssue({ code: "custom", message: "NOTIFICATION_PROVIDER must be set in production" });
      return z.NEVER;
    }
    if (provider === "simulated" && env.APP_ENV === "production") {
      ctx.addIssue({
        code: "custom",
        message: "The simulated notification provider cannot be used when APP_ENV=production",
      });
      return z.NEVER;
    }
    if (provider === "twilio") {
      const missing = (
        [
          ["TWILIO_ACCOUNT_SID", env.TWILIO_ACCOUNT_SID],
          ["TWILIO_AUTH_TOKEN", env.TWILIO_AUTH_TOKEN],
          ["TWILIO_VERIFY_SERVICE_SID", env.TWILIO_VERIFY_SERVICE_SID],
        ] as const
      )
        .filter(([, v]) => !v)
        .map(([k]) => k);
      if (!env.TWILIO_MESSAGING_SERVICE_SID && !env.TWILIO_FROM_NUMBER) {
        missing.push("TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER" as never);
      }
      if (missing.length) {
        ctx.addIssue({
          code: "custom",
          message: `NOTIFICATION_PROVIDER=twilio requires: ${missing.join(", ")}`,
        });
        return z.NEVER;
      }
    }
    return {
      ...env,
      NOTIFICATION_PROVIDER: provider,
      voiceConfigured: provider === "simulated" || Boolean(env.TWILIO_VOICE_FROM_NUMBER),
    };
  });

export type ServerEnv = z.infer<typeof serverSchema>;

let cachedServer: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() must not be called in the browser");
  }
  if (cachedServer) return cachedServer;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid server environment: ${formatIssues(parsed.error)}`);
  }
  cachedServer = parsed.data;
  return cachedServer;
}

/** For tests only. */
export function resetEnvCache() {
  cachedServer = undefined;
  cachedPublic = undefined;
}

function formatIssues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".") || "env"}: ${i.message}`).join("; ");
}
