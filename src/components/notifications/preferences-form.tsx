"use client";

import * as React from "react";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { Switch } from "@/components/ui/misc";
import { preferencesSchema, type PreferencesValues } from "@/lib/validation/settings";
import { updatePreferencesAction } from "@/lib/notifications/actions";
import { INTENSITY_DESCRIPTIONS } from "@/lib/scheduler/policy";

interface Props {
  initial: PreferencesValues;
  timeZones: string[];
  submitLabel?: string;
  onSaved?: () => void;
  showAdvanced?: boolean;
}

export function PreferencesForm({
  initial,
  timeZones,
  submitLabel = "Save preferences",
  onSaved,
  showAdvanced = true,
}: Props) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const form = useForm<PreferencesValues>({ resolver: zodResolver(preferencesSchema), defaultValues: initial });
  const e = form.formState.errors;
  const intensity = useWatch({ control: form.control, name: "reminderIntensity" });

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const res = await updatePreferencesAction(values);
      if (!res.ok) {
        setError(res.error);
        for (const [k, v] of Object.entries(res.fieldErrors ?? {}))
          form.setError(k as keyof PreferencesValues, { message: v });
        return;
      }
      toast.success("Preferences saved. Scheduled reminders were updated.");
      form.reset(values);
      onSaved?.();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}
      <Field
        id="timeZone"
        label="Time zone"
        description="Used for quiet hours and your daily limit."
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="quietHoursStart" label="Quiet hours start" error={e.quietHoursStart?.message}>
          {(p) => <Input {...p} type="time" {...form.register("quietHoursStart")} />}
        </Field>
        <Field id="quietHoursEnd" label="Quiet hours end" error={e.quietHoursEnd?.message}>
          {(p) => <Input {...p} type="time" {...form.register("quietHoursEnd")} />}
        </Field>
      </div>
      <p className="text-muted-foreground -mt-3 text-[13px]">
        Nothing is sent between these times. Reminders that would land inside are moved earlier (before a deadline) or
        later (after one). Set both to the same time to disable.
      </p>
      <Field
        id="reminderIntensity"
        label="Default reminder intensity"
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
      <Field
        id="maxDailyNotifications"
        label="Maximum notifications per day"
        description="Across all assignments and channels."
        error={e.maxDailyNotifications?.message}
      >
        {(p) => (
          <Input
            {...p}
            type="number"
            min={1}
            max={12}
            className="max-w-28"
            {...form.register("maxDailyNotifications", { valueAsNumber: true })}
          />
        )}
      </Field>
      <div className="space-y-3">
        <Controller
          control={form.control}
          name="completionMessagesEnabled"
          render={({ field }) => (
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="completionMessagesEnabled" className="text-sm">
                <span className="font-medium">Completion confirmations</span>
                <span className="text-muted-foreground block">
                  A text when your submission is accepted (requires SMS consent).
                </span>
              </label>
              <Switch id="completionMessagesEnabled" checked={field.value} onCheckedChange={field.onChange} />
            </div>
          )}
        />
        <Controller
          control={form.control}
          name="summariesEnabled"
          render={({ field }) => (
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="summariesEnabled" className="text-sm">
                <span className="font-medium">Morning summary</span>
                <span className="text-muted-foreground block">
                  One text around 8 AM listing what&apos;s due in the next 48 hours (requires SMS consent; counts toward
                  your daily maximum).
                </span>
              </label>
              <Switch id="summariesEnabled" checked={field.value} onCheckedChange={field.onChange} />
            </div>
          )}
        />
      </div>
      {showAdvanced && (
        <details className="group border-border rounded-[12px] border p-4">
          <summary className="cursor-pointer text-sm font-medium">Advanced reminder intervals</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              id="firstReminderLeadHours"
              label="First reminder (hours before)"
              optional
              description="Blank = preset."
              error={e.firstReminderLeadHours?.message}
            >
              {(p) => <Input {...p} inputMode="numeric" {...form.register("firstReminderLeadHours")} />}
            </Field>
            <Field
              id="followUpIntervalHours"
              label="Check-in every (hours)"
              optional
              description="Blank = preset. 4–168."
              error={e.followUpIntervalHours?.message}
            >
              {(p) => <Input {...p} inputMode="numeric" {...form.register("followUpIntervalHours")} />}
            </Field>
            <Field
              id="overdueIntervalHours"
              label="Overdue follow-up every (hours)"
              optional
              description="Blank = preset. 2–72."
              error={e.overdueIntervalHours?.message}
            >
              {(p) => <Input {...p} inputMode="numeric" {...form.register("overdueIntervalHours")} />}
            </Field>
            <Field
              id="voiceCallLeadMinutes"
              label="Voice call (minutes before)"
              description="Only if calls are enabled."
              error={e.voiceCallLeadMinutes?.message}
            >
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={15}
                  max={1440}
                  {...form.register("voiceCallLeadMinutes", { valueAsNumber: true })}
                />
              )}
            </Field>
          </div>
        </details>
      )}
      <Button type="submit" loading={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}
