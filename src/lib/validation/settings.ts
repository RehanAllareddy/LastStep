import { z } from "zod";
import { INTENSITIES } from "./assignment";
import { TIME_PATTERN } from "./common";

const optionalHours = (min: number, max: number) =>
  z
    .string()
    .trim()
    .refine(
      (v) => v === "" || (/^\d+$/.test(v) && Number(v) >= min && Number(v) <= max),
      `Enter a value between ${min} and ${max}`,
    );

export const preferencesSchema = z.object({
  timeZone: z.string().min(1).max(64),
  quietHoursStart: z.string().regex(TIME_PATTERN, "Use HH:MM"),
  quietHoursEnd: z.string().regex(TIME_PATTERN, "Use HH:MM"),
  reminderIntensity: z.enum(INTENSITIES),
  maxDailyNotifications: z.number().int().min(1).max(12),
  summariesEnabled: z.boolean(),
  completionMessagesEnabled: z.boolean(),
  firstReminderLeadHours: optionalHours(1, 168),
  followUpIntervalHours: optionalHours(4, 168),
  overdueIntervalHours: optionalHours(2, 72),
  voiceCallLeadMinutes: z.number().int().min(15).max(1440),
});

export type PreferencesValues = z.infer<typeof preferencesSchema>;

export const phoneStartSchema = z.object({ phone: z.string().trim().min(6, "Enter your phone number").max(32) });
export const phoneCheckSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{4,10}$/, "Enter the code we sent"),
});

export const consentChangeSchema = z.object({
  category: z.enum(["sms_reminders", "voice_reminders", "marketing"]),
  grant: z.boolean(),
  source: z.enum(["onboarding", "settings"]),
});

export const profileSchema = z.object({
  displayName: z.string().trim().min(1, "Enter a name").max(60),
  timeZone: z.string().min(1).max(64),
});
