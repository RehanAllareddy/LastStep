"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  changeEmailAction,
  deleteAccountAction,
  sendPasswordResetAction,
  updateProfileAction,
} from "@/lib/account/actions";

export function ProfileForm({
  displayName,
  timeZone,
  timeZones,
}: {
  displayName: string;
  timeZone: string;
  timeZones: string[];
}) {
  const router = useRouter();
  const [name, setName] = React.useState(displayName);
  const [tz, setTz] = React.useState(timeZone);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, start] = React.useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await updateProfileAction({ displayName: name, timeZone: tz });
          if (!res.ok) {
            setErrors(res.fieldErrors ?? {});
            return void toast.error(res.error);
          }
          setErrors({});
          toast.success("Profile saved");
          router.refresh();
        });
      }}
    >
      <Field id="displayName" label="Preferred name" error={errors.displayName}>
        {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />}
      </Field>
      <Field
        id="profileTz"
        label="Time zone"
        description="Used for your dashboard and new assignments."
        error={errors.timeZone}
      >
        {(p) => (
          <NativeSelect {...p} value={tz} onChange={(e) => setTz(e.target.value)}>
            {timeZones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </NativeSelect>
        )}
      </Field>
      <Button type="submit" loading={pending}>
        Save profile
      </Button>
    </form>
  );
}

export function EmailForm({ email }: { email: string | null }) {
  const [value, setValue] = React.useState("");
  const [pending, start] = React.useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await changeEmailAction({ email: value });
          if (!res.ok) return void toast.error(res.error);
          toast.success("Check both inboxes to confirm the change.");
          setValue("");
        });
      }}
    >
      <p className="text-muted-foreground text-sm">
        Current: <span className="text-foreground font-medium">{email ?? "—"}</span>
      </p>
      <Field id="newEmail" label="New email">
        {(p) => (
          <Input {...p} type="email" autoComplete="email" value={value} onChange={(e) => setValue(e.target.value)} />
        )}
      </Field>
      <Button type="submit" variant="outline" loading={pending} disabled={!value}>
        Change email
      </Button>
    </form>
  );
}

export function PasswordResetButton() {
  const [pending, start] = React.useTransition();
  return (
    <Button
      variant="outline"
      loading={pending}
      onClick={() =>
        start(async () => {
          const res = await sendPasswordResetAction();
          if (res.ok) toast.success("Password reset link sent to your email.");
          else toast.error(res.error);
        })
      }
    >
      Email me a reset link
    </Button>
  );
}

export function DeleteAccountDialog() {
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive">Delete account</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Delete your account?</DialogTitle>
        <DialogDescription asChild>
          <div className="space-y-2">
            <p>This is permanent. We will immediately:</p>
            <ul className="ml-5 list-disc space-y-1">
              <li>stop all texts and calls and cancel every pending reminder,</li>
              <li>revoke your notification consents,</li>
              <li>delete your screenshots, assignments, and account data.</li>
            </ul>
            <p>Consider exporting your data first.</p>
          </div>
        </DialogDescription>
        <div className="mt-4">
          <Field
            id="confirmDelete"
            label={
              <>
                Type <span className="font-mono">DELETE</span> to confirm
              </>
            }
            error={error ?? undefined}
          >
            {(p) => <Input {...p} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />}
          </Field>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={text !== "DELETE"}
            loading={pending}
            onClick={() =>
              start(async () => {
                const res = await deleteAccountAction({ confirmation: text });
                if (res && !res.ok) setError(res.error);
              })
            }
          >
            Permanently delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
