/**
 * Provider abstraction so the scheduler never depends on a specific vendor.
 * Implementations throw ProviderError (see scheduler/retry) on failure.
 */

export interface SendSmsInput {
  to: string;
  body: string;
  statusCallbackUrl?: string;
  userId?: string;
  kind?: string;
}

export interface PlaceCallInput {
  to: string;
  script: string;
  statusCallbackUrl?: string;
  userId?: string;
}

export interface SendResult {
  providerMessageId: string;
  providerStatus: string;
  simulated: boolean;
}

export interface NotificationProvider {
  readonly name: "twilio" | "simulated";
  readonly voiceAvailable: boolean;
  sendSms(input: SendSmsInput): Promise<SendResult>;
  placeCall(input: PlaceCallInput): Promise<SendResult>;
}

export interface VerificationProvider {
  readonly name: "twilio" | "simulated";
  /** Sends an OTP. Returns an HMAC of the code when the code is generated locally (simulated only). */
  start(input: { to: string; userId: string; verificationKey: string }): Promise<{ codeHash: string | null }>;
  /** Checks an OTP. Never logs or stores the code. */
  check(input: { to: string; code: string; verificationKey: string; codeHash: string | null }): Promise<boolean>;
}
