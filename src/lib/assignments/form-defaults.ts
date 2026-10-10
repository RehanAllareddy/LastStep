import type { AssignmentFormValues } from "@/lib/validation/assignment";
import type { Assignment } from "./service";
import { addDaysToDateString, localDateString, localTimeString } from "@/lib/time/zones";

export function newAssignmentDefaults(
  timeZone: string,
  intensity: AssignmentFormValues["reminderIntensity"],
  channels: ("sms" | "voice")[],
): AssignmentFormValues {
  return {
    title: "",
    description: "",
    subject: "",
    dueDate: addDaysToDateString(localDateString(new Date(), timeZone), 1),
    dueTime: "23:59",
    timeZone,
    priority: "normal",
    estimatedMinutes: "",
    reminderIntensity: intensity,
    channels: channels.filter((c) => c === "sms"),
    commitment: "",
    completionPolicy: "self_attested",
    recoveryDueDate: "",
    recoveryDueTime: "",
  };
}

export function editDefaults(a: Assignment): AssignmentFormValues {
  return {
    title: a.title,
    description: a.description ?? "",
    subject: a.subject ?? "",
    dueDate: localDateString(new Date(a.due_at), a.time_zone),
    dueTime: localTimeString(new Date(a.due_at), a.time_zone),
    timeZone: a.time_zone,
    priority: a.priority,
    estimatedMinutes: a.estimated_minutes?.toString() ?? "",
    reminderIntensity: a.reminder_intensity,
    channels: a.channels,
    commitment: a.commitment ?? "",
    completionPolicy: a.completion_policy,
    recoveryDueDate: "",
    recoveryDueTime: "",
  };
}
