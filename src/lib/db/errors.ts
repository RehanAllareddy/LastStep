/** Maps machine-readable database error codes to safe, user-facing messages. */
const MESSAGES: Record<string, string> = {
  not_found: "We couldn't find that assignment.",
  not_editable: "This assignment can no longer be edited.",
  not_submittable: "This assignment isn't accepting submissions right now.",
  attestation_required: "Please confirm that your work is complete.",
  deadline_in_past: "Choose a deadline in the future.",
  invalid_time_zone: "Choose a valid time zone.",
  invalid_transition: "That change isn't allowed for this assignment's current status.",
  too_many_active_assignments: "You've reached the limit of open assignments. Finish or cancel some first.",
  too_many_scheduled_reminders: "You have too many scheduled reminders. Try a gentler reminder intensity.",
  account_unavailable: "This account is no longer available.",
  phone_not_verified: "Verify your phone number first.",
  phone_opted_out: "This number replied STOP. Text START to our number to resubscribe, then try again.",
  verification_not_pending: "That verification code has expired. Request a new one.",
  forbidden: "You don't have permission to do that.",
  not_pending: "That submission is no longer awaiting review.",
};

export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly userMessage: string = MESSAGES[code] ?? "Something went wrong. Please try again.",
  ) {
    super(code);
    this.name = "AppError";
  }
}

/** Converts a PostgREST/Postgres error into an AppError without leaking internals. */
export function toAppError(error: { message?: string; code?: string } | null | undefined): AppError {
  const code = error?.message && MESSAGES[error.message] ? error.message : "internal";
  if (code === "internal" && error) {
    console.error("[db] unexpected error", { code: error.code });
  }
  return new AppError(code);
}

export function userMessage(error: unknown): string {
  if (error instanceof AppError) return error.userMessage;
  return "Something went wrong. Please try again.";
}
