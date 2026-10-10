"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, Switch } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { changeConsentAction, setChannelEnabledAction } from "@/lib/notifications/actions";

interface Props {
  channel: "sms" | "voice";
  phoneVerified: boolean;
  available: boolean;
  consent: { granted_at: string; agreement_version: string } | null;
  enabled: boolean;
  grantedLabel: string | null;
}

const COPY = {
  sms: {
    title: "SMS accountability reminders",
    agree:
      "I agree to receive automated text reminders from LastStep about my assignments at my verified number. Consent isn't required to use LastStep. Msg & data rates may apply. Reply STOP to cancel.",
  },
  voice: {
    title: "Automated voice-call reminders",
    agree:
      "I agree to receive automated (prerecorded/synthesized) reminder calls from LastStep at my verified number. Consent isn't required. I can turn calls off any time.",
  },
};

export function ChannelConsent({ channel, phoneVerified, available, consent, enabled, grantedLabel }: Props) {
  const router = useRouter();
  const [agree, setAgree] = React.useState(false);
  const [revokeOpen, setRevokeOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const category = channel === "sms" ? "sms_reminders" : "voice_reminders";
  const copy = COPY[channel];

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error ?? "Something went wrong");
      toast.success(msg);
      setAgree(false);
      setRevokeOpen(false);
      router.refresh();
    });

  return (
    <div className="border-border space-y-4 rounded-[12px] border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{copy.title}</p>
        {consent ? <Badge tone="success">Consent given</Badge> : <Badge>No consent</Badge>}
      </div>
      {!available ? (
        <p className="text-muted-foreground text-sm">Not available on this deployment yet.</p>
      ) : !phoneVerified ? (
        <p className="text-muted-foreground text-sm">Verify a phone number above to enable this.</p>
      ) : consent ? (
        <>
          <p className="text-muted-foreground text-[13px]">
            Agreed {grantedLabel} · version {consent.agreement_version}
          </p>
          <div className="flex items-center justify-between gap-4">
            <label htmlFor={`enabled-${channel}`} className="text-sm">
              <span className="font-medium">{enabled ? "On" : "Paused"}</span>
              <span className="text-muted-foreground block">
                Turning this off cancels pending {channel === "sms" ? "texts" : "calls"} but keeps your consent on file.
              </span>
            </label>
            <Switch
              id={`enabled-${channel}`}
              checked={enabled}
              disabled={pending}
              onCheckedChange={(v) =>
                act(
                  () => setChannelEnabledAction({ channel, enabled: v }),
                  v ? "Turned on. Reminders rescheduled." : "Turned off. Pending reminders canceled.",
                )
              }
            />
          </div>
          <Dialog open={revokeOpen} onOpenChange={setRevokeOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-danger">
                Revoke consent
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle>Revoke {channel === "sms" ? "SMS" : "voice-call"} consent?</DialogTitle>
              <DialogDescription>
                This takes effect immediately on our servers: every pending {channel === "sms" ? "text" : "call"} is
                canceled and none will be sent until you agree again.
              </DialogDescription>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Keep consent</Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  loading={pending}
                  onClick={() =>
                    act(
                      () => changeConsentAction({ category, grant: false, source: "settings" }),
                      "Consent revoked. Pending reminders canceled.",
                    )
                  }
                >
                  Revoke
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <>
          <div className="flex gap-3">
            <Checkbox id={`agree-${channel}`} checked={agree} onCheckedChange={(c) => setAgree(c === true)} />
            <label htmlFor={`agree-${channel}`} className="text-muted-foreground text-sm leading-snug">
              {copy.agree} See the{" "}
              <a href="/sms-terms" target="_blank" className="text-accent hover:underline">
                SMS Terms
              </a>
              .
            </label>
          </div>
          <Button
            size="sm"
            disabled={!agree}
            loading={pending}
            onClick={() =>
              act(
                () => changeConsentAction({ category, grant: true, source: "settings" }),
                "Consent recorded. Reminders scheduled.",
              )
            }
          >
            Give consent
          </Button>
        </>
      )}
    </div>
  );
}
