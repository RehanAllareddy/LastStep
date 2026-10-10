"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pause, Pencil, Play, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { assignmentLifecycleAction } from "@/lib/assignments/actions";
import {
  canCancel,
  canEdit,
  canPause,
  canResume,
  canSubmit,
  type AssignmentStatus,
} from "@/lib/assignments/state-machine";

export function LifecycleActions({ id, status }: { id: string; status: AssignmentStatus }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = React.useState(false);

  const run = async (action: "pause" | "resume" | "cancel") => {
    setPending(action);
    const res = await assignmentLifecycleAction({ assignmentId: id, action });
    setPending(null);
    if (!res.ok) return toast.error(res.error);
    toast.success(
      action === "pause"
        ? "Paused. Pending reminders were canceled."
        : action === "resume"
          ? "Resumed. Reminders rescheduled."
          : "Assignment canceled. Reminders stopped.",
    );
    setCancelOpen(false);
    router.refresh();
  };

  return (
    <div className="flex flex-wrap gap-2">
      {canSubmit(status) && (
        <Button asChild>
          <Link href={`/assignments/${id}/submit`}>
            <Upload /> Submit work
          </Link>
        </Button>
      )}
      {canEdit(status) && (
        <Button asChild variant="outline">
          <Link href={`/assignments/${id}/edit`}>
            <Pencil /> Edit / reschedule
          </Link>
        </Button>
      )}
      {canPause(status) && (
        <Button variant="outline" loading={pending === "pause"} onClick={() => run("pause")}>
          <Pause /> Pause
        </Button>
      )}
      {canResume(status) && (
        <Button variant="outline" loading={pending === "resume"} onClick={() => run("resume")}>
          <Play /> Resume
        </Button>
      )}
      {canCancel(status) && (
        <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" className="text-danger hover:text-danger">
              <XCircle /> Cancel assignment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Cancel this assignment?</DialogTitle>
            <DialogDescription>
              All pending reminders will stop. Canceled assignments can&apos;t be reopened, but you can always create a
              new one.
            </DialogDescription>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Keep it</Button>
              </DialogClose>
              <Button variant="destructive" loading={pending === "cancel"} onClick={() => run("cancel")}>
                Cancel assignment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
