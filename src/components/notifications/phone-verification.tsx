"use client";

import * as React from "react";
import { CheckCircle2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { checkPhoneVerificationAction, startPhoneVerificationAction } from "@/lib/notifications/actions";

interface Props {
  currentMasked: string | null;
  verified: boolean;
  onVerified?: () => void;
  simulated: boolean;
}

export function PhoneVerification({ currentMasked, verified, onVerified, simulated }: Props) {
  const [stage, setStage] = React.useState<"idle" | "code">("idle");
  const [editing, setEditing] = React.useState(!verified);
  const [phone, setPhone] = React.useState("");
  const [code, setCode] = React.useState("");
  const [sentTo, setSentTo] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  if (verified && !editing) {
    return (
      <div className="border-success/25 bg-success-soft flex flex-wrap items-center justify-between gap-3 rounded-[12px] border p-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="text-success size-5" aria-hidden />
          <div>
            <p className="text-sm font-medium">Verified number</p>
            <p className="text-muted-foreground text-sm tabular-nums">{currentMasked}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          Change number
        </Button>
      </div>
    );
  }

  const send = () => {
    setError(null);
    startTransition(async () => {
      const res = await startPhoneVerificationAction({ phone });
      if (!res.ok) return setError(res.error);
      setSentTo(res.data.masked);
      setStage("code");
      toast.success(simulated ? "Code generated (simulated — see the dev outbox)" : "Code sent");
    });
  };
  const check = () => {
    setError(null);
    startTransition(async () => {
      const res = await checkPhoneVerificationAction({ code });
      if (!res.ok) return setError(res.error);
      toast.success("Phone number verified");
      setEditing(false);
      setStage("idle");
      setCode("");
      onVerified?.();
    });
  };

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      {verified && editing && (
        <Alert tone="warning">
          Verifying a new number replaces {currentMasked} and turns off text and call reminders until you consent again
          for the new number.
        </Alert>
      )}
      {simulated && (
        <Alert tone="info" title="Development mode">
          No real texts are sent. The verification code appears in the{" "}
          <a href="/dev/outbox" target="_blank" className="text-accent font-medium underline-offset-2 hover:underline">
            simulated outbox
          </a>
          .
        </Alert>
      )}
      {stage === "idle" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="space-y-4"
        >
          <Field
            id="phone"
            label="Mobile number"
            description="International format, e.g. +1 555 123 4567. We'll text you a 6-digit code."
          >
            {(p) => (
              <div className="relative">
                <Smartphone
                  className="text-subtle-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                  aria-hidden
                />
                <Input
                  {...p}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  className="pl-9"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 555 123 4567"
                />
              </div>
            )}
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={pending} disabled={phone.trim().length < 6}>
              Send code
            </Button>
            {verified && (
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Keep current number
              </Button>
            )}
          </div>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            check();
          }}
          className="space-y-4"
        >
          <Field id="code" label="Verification code" description={`Sent to ${sentTo}. Codes expire after 10 minutes.`}>
            {(p) => (
              <Input
                {...p}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={10}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="max-w-40 tracking-[0.3em] tabular-nums"
              />
            )}
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={pending} disabled={code.length < 4}>
              Verify
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setStage("idle");
                setError(null);
              }}
            >
              Use a different number
            </Button>
            <Button type="button" variant="link" onClick={send} disabled={pending}>
              Resend code
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
