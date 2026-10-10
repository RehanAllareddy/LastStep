import { AlertCircle, CheckCircle2, Circle, Clock, Eye, PauseCircle, Send, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, type AssignmentStatus } from "@/lib/assignments/state-machine";

const TONE: Record<AssignmentStatus, "neutral" | "accent" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  active: "accent",
  submitted: "accent",
  under_review: "warning",
  completed: "success",
  overdue: "danger",
  paused: "neutral",
  canceled: "neutral",
};

const ICON = {
  draft: Circle,
  active: Clock,
  submitted: Send,
  under_review: Eye,
  completed: CheckCircle2,
  overdue: AlertCircle,
  paused: PauseCircle,
  canceled: XCircle,
} satisfies Record<AssignmentStatus, unknown>;

export function StatusBadge({ status }: { status: AssignmentStatus }) {
  const Icon = ICON[status];
  return (
    <Badge tone={TONE[status]}>
      <Icon aria-hidden />
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: "low" | "normal" | "high" }) {
  if (priority === "normal") return null;
  return (
    <Badge tone={priority === "high" ? "warning" : "outline"}>
      {priority === "high" ? "High priority" : "Low priority"}
    </Badge>
  );
}
