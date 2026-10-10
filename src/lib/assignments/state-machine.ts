/**
 * Assignment lifecycle. The database enforces the same table
 * (public.assignment_transitions + trigger); this module lets the UI and
 * server code reason about it without a round trip.
 *
 *   draft ──► active ──► submitted ──► completed
 *               │  ▲          └──► under_review ──► completed
 *               │  │                     └──► active / overdue (rejected)
 *               ▼  │
 *     paused ◄──┴──► overdue ──► submitted (late submission)
 *        any non-terminal ──► canceled
 */

export const ASSIGNMENT_STATUSES = [
  "draft",
  "active",
  "submitted",
  "under_review",
  "completed",
  "overdue",
  "paused",
  "canceled",
] as const;

export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const TRANSITIONS: Readonly<Record<AssignmentStatus, readonly AssignmentStatus[]>> = {
  draft: ["active", "canceled"],
  active: ["submitted", "paused", "overdue", "canceled"],
  overdue: ["submitted", "paused", "canceled", "active"],
  paused: ["active", "overdue", "canceled", "submitted"],
  submitted: ["completed", "under_review"],
  under_review: ["completed", "active", "overdue"],
  completed: [],
  canceled: [],
};

export function canTransition(from: AssignmentStatus, to: AssignmentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminal(status: AssignmentStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/** Statuses in which reminders may be scheduled or dispatched. */
export function remindersAllowed(status: AssignmentStatus): boolean {
  return status === "active" || status === "overdue";
}

export function canEdit(status: AssignmentStatus): boolean {
  return status === "active" || status === "overdue" || status === "paused";
}

export function canSubmit(status: AssignmentStatus): boolean {
  return canTransition(status, "submitted");
}

export function canPause(status: AssignmentStatus): boolean {
  return canTransition(status, "paused");
}

export function canResume(status: AssignmentStatus): boolean {
  return status === "paused";
}

export function canCancel(status: AssignmentStatus): boolean {
  return canTransition(status, "canceled");
}

export const STATUS_LABELS: Record<AssignmentStatus, string> = {
  draft: "Draft",
  active: "Active",
  submitted: "Submitted",
  under_review: "Under review",
  completed: "Completed",
  overdue: "Overdue",
  paused: "Paused",
  canceled: "Canceled",
};
