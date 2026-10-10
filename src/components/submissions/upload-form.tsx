"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Clock, ImageUp, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Checkbox, Progress } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

const ACCEPT = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 4 * 1024 * 1024;

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; progress: number }
  | { kind: "error"; message: string }
  | { kind: "done"; status: string; canceled: number };

export function UploadForm({
  assignmentId,
  policy,
}: {
  assignmentId: string;
  policy: "self_attested" | "review_required";
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const xhrRef = React.useRef<XMLHttpRequest | null>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [attested, setAttested] = React.useState(false);
  const [phase, setPhase] = React.useState<Phase>({ kind: "idle" });

  React.useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const choose = (f: File | undefined) => {
    if (!f) return;
    if (!ACCEPT.includes(f.type)) return setPhase({ kind: "error", message: "Upload a PNG, JPEG, or WebP image." });
    if (f.size > MAX_BYTES)
      return setPhase({ kind: "error", message: "That file is larger than 4 MB. Try a smaller screenshot." });
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setPhase({ kind: "idle" });
  };

  const upload = () => {
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    body.append("selfAttested", String(policy === "self_attested" ? attested : false));
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", `/api/assignments/${assignmentId}/submissions`);
    xhr.upload.onprogress = (e) =>
      e.lengthComputable && setPhase({ kind: "uploading", progress: Math.round((e.loaded / e.total) * 100) });
    xhr.onload = () => {
      xhrRef.current = null;
      let data: { error?: string; status?: string; canceledReminders?: number } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        // No router.refresh(): it would re-render this page as "not accepting
        // submissions" and hide the confirmation. Paths are revalidated server-side.
        setPhase({ kind: "done", status: data.status ?? "", canceled: data.canceledReminders ?? 0 });
      } else {
        setPhase({ kind: "error", message: data.error ?? "Upload failed. Please try again." });
      }
    };
    xhr.onerror = () => {
      xhrRef.current = null;
      setPhase({ kind: "error", message: "Network error. Check your connection and retry." });
    };
    xhr.onabort = () => {
      xhrRef.current = null;
      setPhase({ kind: "idle" });
    };
    setPhase({ kind: "uploading", progress: 0 });
    xhr.send(body);
  };

  if (phase.kind === "done") {
    const review = phase.status === "under_review";
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center" role="status">
        {review ? (
          <Clock className="text-warning size-12" aria-hidden />
        ) : (
          <CheckCircle2 className="text-success size-12" aria-hidden />
        )}
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            {review ? "Submitted for review" : "Submission accepted"}
          </h2>
          <p className="text-muted-foreground mt-2 max-w-sm text-sm">
            {review
              ? "Reminders are stopped while your screenshot is reviewed. We'll reopen the assignment if it isn't accepted."
              : `This assignment is complete.${phase.canceled ? ` ${phase.canceled} pending reminder${phase.canceled === 1 ? " was" : "s were"} canceled.` : ""} Nice work.`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/dashboard">Back to overview</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/assignments/${assignmentId}`}>View assignment</Link>
          </Button>
        </div>
      </div>
    );
  }

  const uploading = phase.kind === "uploading";
  return (
    <div className="space-y-5">
      {phase.kind === "error" && <Alert tone="danger">{phase.message}</Alert>}
      {!file ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            choose(e.dataTransfer.files[0]);
          }}
          className={cn(
            "border-border-strong hover:border-accent hover:bg-accent-soft/30 flex w-full flex-col items-center gap-3 rounded-[var(--radius)] border-2 border-dashed px-6 py-12 text-center transition-colors",
            dragging && "border-accent bg-accent-soft/40",
          )}
        >
          <ImageUp className="text-accent size-8" aria-hidden />
          <span className="font-medium">Drop a screenshot here, or click to choose</span>
          <span className="text-muted-foreground text-[13px]">PNG, JPEG, or WebP · up to 4 MB</span>
        </button>
      ) : (
        <div className="space-y-3">
          <div className="border-border bg-surface-muted relative overflow-hidden rounded-[var(--radius)] border">
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element -- local blob: preview, not optimizable
              <img src={preview} alt="Preview of your screenshot" className="mx-auto max-h-80 object-contain" />
            )}
            {!uploading && (
              <Button
                variant="secondary"
                size="icon"
                className="absolute top-2 right-2"
                aria-label="Remove file"
                onClick={() => {
                  setFile(null);
                  setPreview(null);
                }}
              >
                <X />
              </Button>
            )}
          </div>
          <p className="text-muted-foreground truncate text-[13px]">
            {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB. Location and device metadata are removed when we
            process it.
          </p>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose screenshot"
        onChange={(e) => {
          choose(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {policy === "self_attested" ? (
        <div className="border-border flex gap-3 rounded-[12px] border p-4">
          <Checkbox
            id="attest"
            checked={attested}
            onCheckedChange={(c) => setAttested(c === true)}
            disabled={uploading}
          />
          <label htmlFor="attest" className="text-sm leading-snug">
            I confirm this assignment is complete. My submission will be accepted right away and all reminders for it
            will stop.
          </label>
        </div>
      ) : (
        <Alert tone="info" title="Review required">
          Your screenshot will be reviewed. Reminders stop while it&apos;s under review and resume if it isn&apos;t
          accepted.
        </Alert>
      )}

      {uploading && (
        <div className="space-y-2" aria-live="polite">
          <Progress value={phase.progress} aria-label="Upload progress" />
          <p className="text-muted-foreground text-[13px]">
            {phase.progress < 100 ? `Uploading… ${phase.progress}%` : "Processing…"}
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {uploading ? (
          <Button variant="outline" onClick={() => xhrRef.current?.abort()}>
            Cancel upload
          </Button>
        ) : (
          <Button onClick={upload} disabled={!file || (policy === "self_attested" && !attested)}>
            {phase.kind === "error" ? (
              <>
                <RotateCcw /> Retry upload
              </>
            ) : (
              "Submit work"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
