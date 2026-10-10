/**
 * Versioned agreement identifiers. Bump a version whenever the corresponding
 * text changes materially; new grants record the version shown to the user.
 *
 * DRAFTS: these documents are implementation drafts and require review by
 * qualified counsel before public launch.
 */
export const TERMS_VERSION = "terms-2026-10-09-draft";
export const PRIVACY_VERSION = "privacy-2026-10-09-draft";
export const SMS_AGREEMENT_VERSION = "sms-2026-10-09-draft";
export const VOICE_AGREEMENT_VERSION = "voice-2026-10-09-draft";

export const CONSENT_CATEGORIES = ["sms_reminders", "voice_reminders", "marketing"] as const;
export type ConsentCategory = (typeof CONSENT_CATEGORIES)[number];

export function agreementVersionFor(category: ConsentCategory): string {
  return category === "voice_reminders" ? VOICE_AGREEMENT_VERSION : SMS_AGREEMENT_VERSION;
}

export const CONSENT_LABELS: Record<ConsentCategory, string> = {
  sms_reminders: "SMS accountability reminders",
  voice_reminders: "Automated voice-call reminders",
  marketing: "Product updates and marketing",
};

/** Marketing messaging is not implemented; the category exists so it can never be bundled. */
export const MARKETING_MESSAGING_IMPLEMENTED = false;
