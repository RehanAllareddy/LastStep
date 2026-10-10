"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
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
import { deleteEvidenceAction } from "@/lib/account/actions";

export function DeleteEvidenceButton({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Trash2 /> Delete screenshot
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Delete this screenshot?</DialogTitle>
        <DialogDescription>The image is permanently removed. The assignment stays completed.</DialogDescription>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Keep</Button>
          </DialogClose>
          <Button
            variant="destructive"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await deleteEvidenceAction(submissionId);
                if (!res.ok) return void toast.error(res.error);
                toast.success("Screenshot deleted");
                setOpen(false);
                router.refresh();
              })
            }
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
