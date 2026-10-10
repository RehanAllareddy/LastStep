"use client";

import * as React from "react";
import { relativeDeadline } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Live "time left" label. The first render uses the server's clock so
 * hydration matches; afterwards it ticks every 30s on the client.
 */
export function TimeLeft({
  dueAt,
  serverNow,
  className,
  dueSoonMs = 24 * 3600_000,
}: {
  dueAt: string;
  serverNow: string;
  className?: string;
  dueSoonMs?: number;
}) {
  const [now, setNow] = React.useState(() => new Date(serverNow));
  React.useEffect(() => {
    const first = setTimeout(() => setNow(new Date()), 0);
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  const rel = relativeDeadline(dueAt, now);
  if (!rel) return <span className={className}>Deadline unavailable</span>;
  const soon = !rel.overdue && rel.ms < dueSoonMs;
  return (
    <span
      className={cn(
        "tabular-nums",
        rel.overdue ? "text-danger" : soon ? "text-warning" : "text-muted-foreground",
        className,
      )}
    >
      {rel.label}
    </span>
  );
}
