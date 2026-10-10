import type { ReminderKind } from "@/lib/scheduler/policy";

/**
 * Message templates. Supportive, factual, no guilt or fabricated urgency.
 * Every SMS that can repeat carries opt-out instructions.
 */

const MAX_TITLE = 60;

export function sanitizeTitle(title: string): string {
  const clean = title
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > MAX_TITLE ? `${clean.slice(0, MAX_TITLE - 1)}…` : clean;
}

export function formatDueTime(dueAt: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(dueAt);
}

export interface ReminderMessageInput {
  kind: ReminderKind;
  title: string;
  dueAt: Date;
  timeZone: string;
}

export function renderSms({ kind, title, dueAt, timeZone }: ReminderMessageInput): string {
  const t = sanitizeTitle(title);
  const due = formatDueTime(dueAt, timeZone);
  switch (kind) {
    case "before_deadline":
      return `LastStep: Your assignment '${t}' is due at ${due}. Take the next step and make some progress. Submit your work when you're finished. Reply STOP to stop SMS reminders.`;
    case "follow_up":
      return `LastStep check-in: '${t}' is still marked as unfinished. Take a few minutes to work on it. Upload your proof when you're done. Reply STOP to stop SMS reminders.`;
    case "due_now":
      return `LastStep: Your deadline for '${t}' is here. Focus on the next step. When your work is complete, upload a screenshot in LastStep. Reply STOP to stop SMS reminders.`;
    case "overdue":
      return `LastStep: '${t}' was due ${due} and is still open. It's not too late to finish. Upload a screenshot in LastStep when it's done. Reply STOP to stop SMS reminders.`;
    case "voice_call":
      return renderVoiceScript({ kind, title, dueAt, timeZone });
  }
}

export function renderCompletionSms(title: string): string {
  return `LastStep: Your submission for '${sanitizeTitle(title)}' has been accepted. Your reminders for this assignment have stopped. Nice work.`;
}

export function renderVoiceScript({ title, dueAt, timeZone }: ReminderMessageInput): string {
  return (
    `Hello, this is an automated reminder from LastStep. ` +
    `Your assignment, ${sanitizeTitle(title)}, is due ${formatDueTime(dueAt, timeZone)}. ` +
    `When your work is complete, upload a screenshot in the LastStep app. ` +
    `To stop these calls, turn off voice reminders in your LastStep notification settings. Goodbye.`
  );
}

export function renderVerificationSms(code: string): string {
  return `Your LastStep verification code is ${code}. It expires in 10 minutes. If you didn't request this, ignore this message.`;
}
