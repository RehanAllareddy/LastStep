"use client";

import * as React from "react";
import Link from "next/link";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { ArrowRight, BellRing, CheckCircle2, MailCheck, Target } from "lucide-react";
import { AuthCard } from "@/components/layout/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/misc";
import { signUpSchema } from "@/lib/validation/auth";
import { signUpAction } from "@/lib/auth/actions";

type Values = z.input<typeof signUpSchema>;

function Welcome({ onContinue }: { onContinue: () => void }) {
  return (
    <AuthCard
      title="Welcome to LastStep"
      description="A simple loop that helps you actually finish."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/sign-in" className="text-accent font-medium hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <ol className="space-y-4">
        {[
          { icon: Target, t: "Commit", d: "Add an assignment and its real deadline." },
          { icon: BellRing, t: "Focus", d: "Get reminders on your schedule — only if you opt in." },
          { icon: CheckCircle2, t: "Finish", d: "Upload a screenshot of your work. Reminders stop." },
        ].map((s) => (
          <li key={s.t} className="flex gap-3">
            <span className="bg-accent-soft text-accent-soft-foreground flex size-8 shrink-0 items-center justify-center rounded-[9px]">
              <s.icon className="size-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold">{s.t}</p>
              <p className="text-muted-foreground text-sm">{s.d}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-muted-foreground mt-6 text-[13px]">
        LastStep is supportive, not punishing: no streak shaming, no fake urgency, and you control every notification.
      </p>
      <Button className="mt-6 w-full" onClick={onContinue}>
        Create my account <ArrowRight />
      </Button>
    </AuthCard>
  );
}

export function SignUpFlow() {
  const [step, setStep] = React.useState<"welcome" | "form" | "sent">("welcome");
  const [sentTo, setSentTo] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const form = useForm<Values>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      displayName: "",
      email: "",
      password: "",
      timeZone: "UTC",
      ageConfirmed: false as unknown as true,
      termsAccepted: false as unknown as true,
    },
  });

  React.useEffect(() => {
    form.setValue("timeZone", Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  }, [form]);

  if (step === "welcome") return <Welcome onContinue={() => setStep("form")} />;

  if (step === "sent") {
    return (
      <AuthCard
        title="Check your email"
        description={
          <>
            We sent a confirmation link to <span className="text-foreground font-medium">{sentTo}</span>.
          </>
        }
      >
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <MailCheck className="text-accent size-10" aria-hidden />
          <p className="text-muted-foreground text-sm">
            Open the link to verify your address, then you&apos;ll set up reminders. It can take a minute to arrive —
            check spam too.
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link href="/sign-in">Go to sign in</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  const errors = form.formState.errors;
  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const res = await signUpAction(values);
      if (!res.ok) {
        setError(res.error);
        for (const [k, v] of Object.entries(res.fieldErrors ?? {})) form.setError(k as keyof Values, { message: v });
        return;
      }
      setSentTo(res.data.email);
      setStep("sent");
    });
  });

  return (
    <AuthCard
      title="Create your account"
      description="Just the essentials. You can add a phone number later — or never."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/sign-in" className="text-accent font-medium hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {error && <Alert tone="danger">{error}</Alert>}
        <Field id="displayName" label="Preferred name" error={errors.displayName?.message}>
          {(p) => <Input {...p} autoComplete="nickname" {...form.register("displayName")} />}
        </Field>
        <Field id="email" label="Email" error={errors.email?.message}>
          {(p) => <Input {...p} type="email" autoComplete="email" {...form.register("email")} />}
        </Field>
        <Field id="password" label="Password" description="At least 10 characters." error={errors.password?.message}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" {...form.register("password")} />}
        </Field>
        <div className="border-border bg-surface-muted/50 space-y-3 rounded-[12px] border p-4">
          <Controller
            control={form.control}
            name="ageConfirmed"
            render={({ field }) => (
              <div className="flex gap-3">
                <Checkbox
                  id="ageConfirmed"
                  checked={field.value === true}
                  onCheckedChange={(c) => field.onChange(c === true)}
                  aria-invalid={errors.ageConfirmed ? true : undefined}
                  aria-describedby={errors.ageConfirmed ? "ageConfirmed-error" : undefined}
                />
                <label htmlFor="ageConfirmed" className="text-sm leading-snug">
                  I am 13 or older. If I&apos;m under 18, a parent or guardian has agreed to my use of LastStep.
                </label>
              </div>
            )}
          />
          {errors.ageConfirmed && (
            <p id="ageConfirmed-error" role="alert" className="text-danger text-[13px] font-medium">
              {errors.ageConfirmed.message}
            </p>
          )}
          <Controller
            control={form.control}
            name="termsAccepted"
            render={({ field }) => (
              <div className="flex gap-3">
                <Checkbox
                  id="termsAccepted"
                  checked={field.value === true}
                  onCheckedChange={(c) => field.onChange(c === true)}
                  aria-invalid={errors.termsAccepted ? true : undefined}
                  aria-describedby={errors.termsAccepted ? "termsAccepted-error" : undefined}
                />
                <label htmlFor="termsAccepted" className="text-sm leading-snug">
                  I agree to the{" "}
                  <Link href="/terms" target="_blank" className="text-accent underline-offset-2 hover:underline">
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" target="_blank" className="text-accent underline-offset-2 hover:underline">
                    Privacy Policy
                  </Link>
                  .
                </label>
              </div>
            )}
          />
          {errors.termsAccepted && (
            <p id="termsAccepted-error" role="alert" className="text-danger text-[13px] font-medium">
              {errors.termsAccepted.message}
            </p>
          )}
          <p className="text-muted-foreground text-xs">
            This does not sign you up for texts or calls — that&apos;s a separate choice later.
          </p>
        </div>
        <Button type="submit" className="w-full" loading={pending}>
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}
