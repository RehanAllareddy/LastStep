"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  retryJobAction,
  reviewSubmissionAction,
  runSchedulerNowAction,
  updateReminderLimitsAction,
} from "@/lib/admin/actions";

export function RunSchedulerButton() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      loading={pending}
      onClick={() =>
        start(async () => {
          const res = await runSchedulerNowAction();
          if (res.ok) toast.success(`Claimed ${res.data.claimed}, sent ${res.data.sent}`);
          else toast.error(res.error);
          router.refresh();
        })
      }
    >
      Run scheduler tick now
    </Button>
  );
}

export function RetryJobButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      loading={pending}
      onClick={() =>
        start(async () => {
          const res = await retryJobAction(jobId);
          if (res.ok) toast.success("Requeued. Consent and eligibility are re-checked at dispatch.");
          else toast.error(res.error);
          router.refresh();
        })
      }
    >
      Retry
    </Button>
  );
}

export function ReviewButtons({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [note, setNote] = React.useState("");
  const [pending, start] = React.useTransition();
  const decide = (decision: "accept" | "reject") =>
    start(async () => {
      const res = await reviewSubmissionAction({ submissionId, decision, note: note || undefined });
      if (res.ok) toast.success(decision === "accept" ? "Accepted" : "Rejected — assignment reopened");
      else toast.error(res.error);
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`note-${submissionId}`}>
        Note to student
      </label>
      <Input
        id={`note-${submissionId}`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note"
        maxLength={500}
        className="h-8 w-48"
      />
      <Button size="sm" loading={pending} onClick={() => decide("accept")}>
        Accept
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => decide("reject")}>
        Reject
      </Button>
    </div>
  );
}

type Limits = Record<string, number>;
export function LimitsForm({ initial }: { initial: Limits }) {
  const router = useRouter();
  const [values, setValues] = React.useState<Limits>(initial);
  const [pending, start] = React.useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await updateReminderLimitsAction(values);
          if (res.ok) toast.success("Limits saved (audited)");
          else toast.error(res.error);
          router.refresh();
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {Object.keys(initial).map((k) => (
          <label key={k} className="space-y-1 text-[13px]">
            <span className="text-muted-foreground">{k.replace(/_/g, " ")}</span>
            <Input
              type="number"
              value={values[k]}
              onChange={(e) => setValues({ ...values, [k]: Number(e.target.value) })}
              className="h-9"
            />
          </label>
        ))}
      </div>
      <Button type="submit" size="sm" loading={pending}>
        Save limits
      </Button>
    </form>
  );
}
