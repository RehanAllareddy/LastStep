"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { AuthCard } from "@/components/layout/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { resetPasswordSchema } from "@/lib/validation/auth";
import { resetPasswordAction } from "@/lib/auth/actions";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const form = useForm<z.infer<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirm: "" },
  });
  const onSubmit = form.handleSubmit((v) =>
    startTransition(async () => {
      const res = await resetPasswordAction(v);
      if (res.ok) router.push("/dashboard");
      else setError(res.error);
    }),
  );
  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {error && <Alert tone="danger">{error}</Alert>}
        <Field
          id="password"
          label="New password"
          description="At least 10 characters."
          error={form.formState.errors.password?.message}
        >
          {(p) => <Input {...p} type="password" autoComplete="new-password" {...form.register("password")} />}
        </Field>
        <Field id="confirm" label="Confirm password" error={form.formState.errors.confirm?.message}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" {...form.register("confirm")} />}
        </Field>
        <Button type="submit" className="w-full" loading={pending}>
          Update password
        </Button>
      </form>
    </AuthCard>
  );
}
