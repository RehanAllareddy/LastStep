"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PhoneVerification } from "@/components/notifications/phone-verification";
import { ConsentDisclosure } from "@/components/notifications/consent-disclosure";
import { ConsentForm } from "@/components/notifications/consent-form";
import { PreferencesForm } from "@/components/notifications/preferences-form";
import { completeOnboardingAction } from "@/lib/account/actions";
import type { PreferencesValues } from "@/lib/validation/settings";
import { cn } from "@/lib/utils";

const STEPS = ["Welcome", "Account", "Phone", "Notifications", "Preferences"] as const;

interface Props {
  name: string;
  phone: { masked: string; verified: boolean } | null;
  hasConsent: boolean;
  preferences: PreferencesValues;
  timeZones: string[];
  voiceAvailable: boolean;
  simulated: boolean;
}

export function OnboardingFlow({ name, phone, hasConsent, preferences, timeZones, voiceAvailable, simulated }: Props) {
  const router = useRouter();
  const [step, setStep] = React.useState<2 | 3 | 4>(phone?.verified ? (hasConsent ? 4 : 3) : 2);
  const [finishing, startFinish] = React.useTransition();
  const finish = () => startFinish(() => completeOnboardingAction());

  return (
    <div className="space-y-8">
      <nav aria-label="Setup progress">
        <ol className="flex items-center gap-2">
          {STEPS.map((label, i) => {
            const done = i < step;
            const current = i === step;
            return (
              <li key={label} className="flex flex-1 flex-col gap-2">
                <span className={cn("h-1 rounded-full", done || current ? "bg-accent" : "bg-border")} />
                <span
                  className={cn(
                    "hidden text-xs sm:flex sm:items-center sm:gap-1",
                    current ? "text-foreground font-medium" : "text-subtle-foreground",
                  )}
                  aria-current={current ? "step" : undefined}
                >
                  {done && <Check className="size-3" aria-hidden />}
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="text-muted-foreground mt-3 text-sm sm:hidden">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </p>
      </nav>

      {step === 2 && (
        <section className="animate-fade-in space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">
              Hi {name || "there"} — want reminders by text?
            </h1>
            <p className="text-muted-foreground mt-2">
              Verify a mobile number to receive reminders. This is optional: LastStep works without it.
            </p>
          </div>
          <Card>
            <CardContent>
              <PhoneVerification
                currentMasked={phone?.masked ?? null}
                verified={Boolean(phone?.verified)}
                simulated={simulated}
                onVerified={() => {
                  router.refresh();
                  setStep(3);
                }}
              />
            </CardContent>
          </Card>
          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep(3)}>
              Skip for now
            </Button>
            {phone?.verified && <Button onClick={() => setStep(3)}>Continue</Button>}
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="animate-fade-in space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">Notification agreement</h1>
            <p className="text-muted-foreground mt-2">
              Please read this before choosing. Nothing is selected for you, and saying no is fine.
            </p>
          </div>
          <Card>
            <CardContent className="space-y-6">
              <ConsentDisclosure />
              <ConsentForm
                phoneVerified={Boolean(phone?.verified)}
                voiceAvailable={voiceAvailable}
                onDone={() => {
                  router.refresh();
                  setStep(4);
                }}
              />
            </CardContent>
          </Card>
          <Button variant="ghost" onClick={() => setStep(2)}>
            Back
          </Button>
        </section>
      )}

      {step === 4 && (
        <section className="animate-fade-in space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">Set your preferences</h1>
            <p className="text-muted-foreground mt-2">
              Sensible defaults are filled in: standard intensity, quiet hours 9:30 PM – 8:00 AM, and at most 4
              notifications a day. You can change these any time.
            </p>
          </div>
          <Card>
            <CardContent>
              <PreferencesForm
                initial={preferences}
                timeZones={timeZones}
                submitLabel="Save and continue"
                showAdvanced={false}
                onSaved={finish}
              />
            </CardContent>
          </Card>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(3)}>
              Back
            </Button>
            <Button variant="outline" onClick={finish} loading={finishing}>
              Keep defaults and finish
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
