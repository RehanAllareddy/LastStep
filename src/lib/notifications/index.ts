import "server-only";
import { serverEnv } from "@/lib/env";
import type { NotificationProvider, VerificationProvider } from "./provider";
import { createSimulatedProvider, createSimulatedVerification } from "./simulated";
import { createTwilioProvider, createTwilioVerification } from "./twilio";

let provider: NotificationProvider | undefined;
let verifier: VerificationProvider | undefined;

/** Selected explicitly by NOTIFICATION_PROVIDER; never silently falls back in production. */
export function notificationProvider(): NotificationProvider {
  if (!provider) {
    provider = serverEnv().NOTIFICATION_PROVIDER === "twilio" ? createTwilioProvider() : createSimulatedProvider();
  }
  return provider;
}

export function verificationProvider(): VerificationProvider {
  if (!verifier) {
    verifier =
      serverEnv().NOTIFICATION_PROVIDER === "twilio" ? createTwilioVerification() : createSimulatedVerification();
  }
  return verifier;
}

export function webhookUrl(path: string): string {
  return new URL(path, process.env.NEXT_PUBLIC_APP_URL).toString();
}

/** Status callbacks need a publicly reachable HTTPS URL. */
export function statusCallbackUrl(path: string): string | undefined {
  const url = webhookUrl(path);
  return url.startsWith("https://") ? url : undefined;
}
