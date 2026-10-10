"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/misc";
import { Card, CardContent } from "@/components/ui/card";
import { assignmentFormSchema, type AssignmentFormValues } from "@/lib/validation/assignment";
import { createAssignmentAction, updateAssignmentAction } from "@/lib/assignments/actions";
import { INTENSITY_DESCRIPTIONS } from "@/lib/scheduler/policy";

interface Props {
  mode: "create" | "edit";
  assignmentId?: string;
  initial: AssignmentFormValues;
  timeZones: string[];
  channelsAvailable: { sms: boolean; voice: boolean };
}

export function AssignmentForm({ mode, assignmentId, initial, timeZones, channelsAvailable }: Props) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [needsRecovery, setNeedsRecovery] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const form = useForm<AssignmentFormValues>({ resolver: zodResolver(assignmentFormSchema), defaultValues: initial });
  const e = form.formState.errors;
  const intensity = useWatch({ control: form.control, name: "reminderIntensity" });
  const policy = useWatch({ control: form.control, name: "completionPolicy" });

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const res =
        mode === "create" ? await createAssignmentAction(values) : await updateAssignmentAction(assignmentId!, values);
      if (!res.ok) {
        if (res.code === "deadline_passed") {
          setNeedsRecovery(true);
          return;
        }
        setError(res.error);
        for (const [k, v] of Object.entries(res.fieldErrors ?? {}))
          form.setError(k as keyof AssignmentFormValues, { message: v });
        return;
      }
      toast.success(
        mode === "create" ? "Commitment created. Reminders scheduled." : "Saved. Future reminders were rescheduled.",
      );
      router.push(`/assignments/${res.data.id}`);
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}
      <Card>
        <CardContent className="space-y-5">
          <Field id="title" label="Assignment title" error={e.title?.message}>
            {(p) => <Input {...p} {...form.register("title")} placeholder="e.g. Chapter 5 problem set" />}
          </Field>
          <Field id="description" label="Description or instructions" optional error={e.description?.message}>
            {(p) => <Textarea {...p} {...form.register("description")} placeholder="What does 'done' look like?" />}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="subject" label="Course or subject" optional error={e.subject?.message}>
              {(p) => <Input {...p} {...form.register("subject")} placeholder="e.g. Chemistry" />}
            </Field>
            <Field id="estimatedMinutes" label="Estimated minutes" optional error={e.estimatedMinutes?.message}>
              {(p) => <Input {...p} inputMode="numeric" {...form.register("estimatedMinutes")} placeholder="e.g. 90" />}
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-3">
            <Field id="dueDate" label="Due date" error={e.dueDate?.message}>
              {(p) => <Input {...p} type="date" {...form.register("dueDate")} />}
            </Field>
            <Field id="dueTime" label="Due time" error={e.dueTime?.message}>
              {(p) => <Input {...p} type="time" {...form.register("dueTime")} />}
            </Field>
            <Field id="priority" label="Priority" error={e.priority?.message}>
              {(p) => (
                <NativeSelect {...p} {...form.register("priority")}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </NativeSelect>
              )}
            </Field>
          </div>
          <Field
            id="timeZone"
            label="Time zone"
            description="The deadline is interpreted in this zone. Defaults to your profile."
            error={e.timeZone?.message}
          >
            {(p) => (
              <NativeSelect {...p} {...form.register("timeZone")}>
                {timeZones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replace(/_/g, " ")}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          {needsRecovery && (
            <div className="border-warning/30 bg-warning-soft space-y-4 rounded-[12px] border p-4">
              <div className="flex gap-3">
                <History className="text-warning mt-0.5 size-4 shrink-0" aria-hidden />
                <div className="text-sm">
                  <p className="font-medium">That deadline has already passed.</p>
                  <p className="text-muted-foreground mt-1">
                    That&apos;s okay. Set a recovery target — a new time you commit to finishing by. We&apos;ll keep the
                    original deadline on record and remind you toward the new one.
                  </p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="recoveryDueDate" label="Recovery date" error={e.recoveryDueDate?.message}>
                  {(p) => <Input {...p} type="date" {...form.register("recoveryDueDate")} />}
                </Field>
                <Field id="recoveryDueTime" label="Recovery time" error={e.recoveryDueTime?.message}>
                  {(p) => <Input {...p} type="time" {...form.register("recoveryDueTime")} />}
                </Field>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-5">
          <Field
            id="reminderIntensity"
            label="Reminder intensity"
            description={INTENSITY_DESCRIPTIONS[intensity]}
            error={e.reminderIntensity?.message}
          >
            {(p) => (
              <NativeSelect {...p} {...form.register("reminderIntensity")}>
                <option value="gentle">Gentle</option>
                <option value="standard">Standard</option>
                <option value="intensive">Intensive</option>
              </NativeSelect>
            )}
          </Field>
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Reminder channels</legend>
            <Controller
              control={form.control}
              name="channels"
              render={({ field }) => (
                <div className="space-y-3">
                  {(["sms", "voice"] as const).map((ch) => {
                    const available = channelsAvailable[ch];
                    const checked = field.value.includes(ch);
                    return (
                      <div key={ch} className="flex items-start gap-3">
                        <Checkbox
                          id={`ch-${ch}`}
                          disabled={!available}
                          checked={checked && available}
                          onCheckedChange={(c) =>
                            field.onChange(
                              c === true ? [...new Set([...field.value, ch])] : field.value.filter((x) => x !== ch),
                            )
                          }
                        />
                        <label htmlFor={`ch-${ch}`} className={`text-sm ${available ? "" : "text-muted-foreground"}`}>
                          <span className="font-medium">
                            {ch === "sms" ? "Text messages" : "Voice call (optional)"}
                          </span>
                          {!available && (
                            <span className="block text-[13px]">
                              Requires a verified phone and {ch === "sms" ? "SMS" : "voice-call"} consent —{" "}
                              <a href="/settings/notifications" className="text-accent hover:underline">
                                set up
                              </a>
                              .
                            </span>
                          )}
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}
            />
            {!channelsAvailable.sms && !channelsAvailable.voice && (
              <p className="text-muted-foreground text-[13px]">
                Without a channel, this assignment is tracked on your dashboard only.
              </p>
            )}
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-5">
          <Field
            id="commitment"
            label="Personal commitment"
            optional
            description="A sentence for future you, e.g. 'I'll finish this before practice.'"
            error={e.commitment?.message}
          >
            {(p) => <Textarea {...p} rows={2} className="min-h-0" {...form.register("commitment")} />}
          </Field>
          <Field
            id="completionPolicy"
            label="How completion works"
            description={
              policy === "self_attested"
                ? "You upload a screenshot and confirm the work is done. It's accepted right away and reminders stop."
                : "Your screenshot goes to a reviewer. Reminders stay stopped while it's under review; if it isn't accepted, the assignment reopens."
            }
          >
            {(p) => (
              <NativeSelect {...p} {...form.register("completionPolicy")}>
                <option value="self_attested">Self-attested (recommended)</option>
                <option value="review_required">Review required</option>
              </NativeSelect>
            )}
          </Field>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {mode === "create" ? (needsRecovery ? "Create recovery plan" : "Create commitment") : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
