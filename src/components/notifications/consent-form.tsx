"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/misc";
import { Alert } from "@/components/ui/alert";
import { changeConsentAction } from "@/lib/notifications/actions";

interface Props {
  phoneVerified: boolean;
  voiceAvailable: boolean;
  onDone: () => void;
  doneLabel?: string;
}

/**
 * Onboarding consent: separate, unchecked controls per category. Declining
 * is a first-class option with equal visual weight.
 */
export function ConsentForm({ phoneVerified, voiceAvailable, onDone, doneLabel = "Continue" }: Props) {
  const [sms, setSms] = React.useState(false);
  const [voice, setVoice] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const save = () => {
    setError(null);
    startTransition(async () => {
      for (const [category, grant] of [
        ["sms_reminders", sms],
        ["voice_reminders", voice],
      ] as const) {
        if (!grant) continue;
        const res = await changeConsentAction({ category, grant: true, source: "onboarding" });
        if (!res.ok) return setError(res.error);
      }
      if (sms || voice) toast.success("Notification choices saved");
      onDone();
    });
  };

  if (!phoneVerified) {
    return (
      <div className="space-y-4">
        <Alert tone="info" title="Texts and calls need a verified phone">
          You skipped phone verification, so LastStep won&apos;t text or call you. Your assignments and dashboard still
          work. You can verify a number and opt in later in Notification Settings.
        </Alert>
        <Button onClick={onDone}>{doneLabel}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && <Alert tone="danger">{error}</Alert>}
      <fieldset className="space-y-3">
        <legend className="mb-3 text-sm font-medium">Choose what you agree to (each is optional)</legend>
        <label
          htmlFor="consent-sms"
          className="border-border has-[[data-state=checked]]:border-accent has-[[data-state=checked]]:bg-accent-soft/40 flex cursor-pointer gap-3 rounded-[12px] border p-4"
        >
          <Checkbox id="consent-sms" checked={sms} onCheckedChange={(c) => setSms(c === true)} />
          <span className="text-sm leading-snug">
            <span className="block font-medium">A. SMS accountability reminders</span>
            <span className="text-muted-foreground">
              I agree to receive automated text reminders from LastStep about my assignments at the number I verified.
              Consent is not required to use LastStep. Msg &amp; data rates may apply. Reply STOP to cancel.
            </span>
          </span>
        </label>
        <label
          htmlFor="consent-voice"
          className={`border-border has-[[data-state=checked]]:border-accent has-[[data-state=checked]]:bg-accent-soft/40 flex gap-3 rounded-[12px] border p-4 ${voiceAvailable ? "cursor-pointer" : "opacity-60"}`}
        >
          <Checkbox
            id="consent-voice"
            checked={voice}
            disabled={!voiceAvailable}
            onCheckedChange={(c) => setVoice(c === true)}
          />
          <span className="text-sm leading-snug">
            <span className="block font-medium">B. Automated voice-call reminders</span>
            <span className="text-muted-foreground">
              {voiceAvailable
                ? "I agree to receive automated (prerecorded/synthesized) reminder calls from LastStep at the number I verified. Consent is not required. I can turn calls off any time in settings."
                : "Voice calls aren't available on this deployment yet."}
            </span>
          </span>
        </label>
        <div className="border-border rounded-[12px] border border-dashed p-4 text-sm">
          <span className="block font-medium">C. Product updates or marketing</span>
          <span className="text-muted-foreground">
            LastStep doesn&apos;t send marketing messages. If that ever changes, we&apos;ll ask you separately — it will
            never be bundled with reminders.
          </span>
        </div>
      </fieldset>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={save} loading={pending} disabled={!sms && !voice}>
          Agree to selected
        </Button>
        <Button variant="outline" onClick={onDone} disabled={pending}>
          Continue without texts or calls
        </Button>
      </div>
    </div>
  );
}
