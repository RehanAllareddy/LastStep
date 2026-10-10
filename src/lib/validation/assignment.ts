import { z } from "zod";
import { DATE_PATTERN, TIME_PATTERN } from "./common";

export const PRIORITIES = ["low", "normal", "high"] as const;
export const INTENSITIES = ["gentle", "standard", "intensive"] as const;
export const COMPLETION_POLICIES = ["self_attested", "review_required"] as const;

export const assignmentFormSchema = z.object({
  title: z.string().trim().min(1, "Give your assignment a title").max(200, "Keep the title under 200 characters"),
  description: z.string().trim().max(5000, "Keep the description under 5,000 characters"),
  subject: z.string().trim().max(100, "Keep the subject under 100 characters"),
  dueDate: z.string().regex(DATE_PATTERN, "Choose a due date"),
  dueTime: z.string().regex(TIME_PATTERN, "Choose a due time"),
  timeZone: z.string().min(1, "Choose a time zone").max(64),
  priority: z.enum(PRIORITIES),
  estimatedMinutes: z
    .string()
    .trim()
    .refine(
      (v) => v === "" || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 10080),
      "Enter minutes between 1 and 10,080",
    ),
  reminderIntensity: z.enum(INTENSITIES),
  channels: z.array(z.enum(["sms", "voice"])).max(2),
  commitment: z.string().trim().max(500, "Keep your commitment under 500 characters"),
  completionPolicy: z.enum(COMPLETION_POLICIES),
  recoveryDueDate: z.string().regex(DATE_PATTERN).or(z.literal("")),
  recoveryDueTime: z.string().regex(TIME_PATTERN).or(z.literal("")),
});

export type AssignmentFormValues = z.infer<typeof assignmentFormSchema>;

export const assignmentActionSchema = z.object({
  assignmentId: z.uuid(),
  action: z.enum(["pause", "resume", "cancel"]),
});
