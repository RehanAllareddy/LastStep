import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "./label";

interface FieldProps {
  id: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  error?: string;
  optional?: boolean;
  className?: string;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => React.ReactNode;
}

/** Accessible label / description / error wiring for one form control. */
export function Field({ id, label, description, error, optional, className, children }: FieldProps) {
  const descId = description ? `${id}-desc` : undefined;
  const errId = error ? `${id}-error` : undefined;
  const describedBy = [descId, errId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>
        {label}
        {optional && <span className="text-subtle-foreground ml-1.5 font-normal">Optional</span>}
      </Label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {description && !error && (
        <p id={descId} className="text-muted-foreground text-[13px]">
          {description}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-danger text-[13px] font-medium">
          {error}
        </p>
      )}
    </div>
  );
}
