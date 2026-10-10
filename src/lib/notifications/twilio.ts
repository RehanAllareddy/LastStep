import "server-only";
import twilio from "twilio";
import { serverEnv } from "@/lib/env";
import { ProviderError } from "@/lib/scheduler/retry";
import type { NotificationProvider, SendResult, VerificationProvider } from "./provider";

type TwilioClient = ReturnType<typeof twilio>;

let client: TwilioClient | undefined;

function twilioClient(): TwilioClient {
  if (client) return client;
  const env = serverEnv();
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) throw new Error("Twilio is not configured");
  // Built-in retries are disabled: retry decisions belong to the scheduler,
  // which knows whether a retry could duplicate a message.
  client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, { autoRetry: false, timeout: 15_000 });
  return client;
}

function toProviderError(error: unknown): ProviderError {
  const e = error as { status?: number; code?: number | string; message?: string };
  return new ProviderError(
    "Provider request failed",
    typeof e?.status === "number" ? e.status : undefined,
    typeof e?.code === "number" ? e.code : undefined,
    typeof e?.code === "string" ? e.code : undefined,
  );
}

export function createTwilioProvider(): NotificationProvider {
  const env = serverEnv();
  return {
    name: "twilio",
    voiceAvailable: Boolean(env.TWILIO_VOICE_FROM_NUMBER),
    async sendSms({ to, body, statusCallbackUrl }): Promise<SendResult> {
      try {
        const msg = await twilioClient().messages.create({
          to,
          body,
          ...(env.TWILIO_MESSAGING_SERVICE_SID
            ? { messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID }
            : { from: env.TWILIO_FROM_NUMBER! }),
          ...(statusCallbackUrl ? { statusCallback: statusCallbackUrl } : {}),
        });
        return { providerMessageId: msg.sid, providerStatus: msg.status, simulated: false };
      } catch (error) {
        throw toProviderError(error);
      }
    },
    async placeCall({ to, script, statusCallbackUrl }): Promise<SendResult> {
      if (!env.TWILIO_VOICE_FROM_NUMBER) throw new ProviderError("Voice not configured", 400);
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say({ voice: "Polly.Joanna" }, script);
      try {
        const call = await twilioClient().calls.create({
          to,
          from: env.TWILIO_VOICE_FROM_NUMBER,
          twiml: twiml.toString(),
          timeout: 25,
          ...(statusCallbackUrl
            ? { statusCallback: statusCallbackUrl, statusCallbackEvent: ["completed"], statusCallbackMethod: "POST" }
            : {}),
        });
        return { providerMessageId: call.sid, providerStatus: call.status, simulated: false };
      } catch (error) {
        throw toProviderError(error);
      }
    },
  };
}

export function createTwilioVerification(): VerificationProvider {
  const env = serverEnv();
  return {
    name: "twilio",
    async start({ to }) {
      try {
        await twilioClient()
          .verify.v2.services(env.TWILIO_VERIFY_SERVICE_SID!)
          .verifications.create({ to, channel: "sms" });
        return { codeHash: null };
      } catch (error) {
        throw toProviderError(error);
      }
    },
    async check({ to, code }) {
      try {
        const result = await twilioClient()
          .verify.v2.services(env.TWILIO_VERIFY_SERVICE_SID!)
          .verificationChecks.create({ to, code });
        return result.status === "approved";
      } catch (error) {
        const e = error as { status?: number };
        // 404 = no pending verification (expired / max attempts reached)
        if (e?.status === 404) return false;
        throw toProviderError(error);
      }
    },
  };
}

/** Validates X-Twilio-Signature against the public URL Twilio called. */
export function validateTwilioSignature(
  signature: string | null,
  url: string,
  params: Record<string, string>,
): boolean {
  const token = serverEnv().TWILIO_AUTH_TOKEN;
  if (!token || !signature) return false;
  return twilio.validateRequest(token, signature, url, params);
}
