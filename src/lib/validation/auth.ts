import { z } from "zod";

export const signUpSchema = z.object({
  displayName: z.string().trim().min(1, "What should we call you?").max(60, "Keep it under 60 characters"),
  email: z.email("Enter a valid email").max(254),
  password: z.string().min(10, "Use at least 10 characters").max(128),
  timeZone: z.string().min(1).max(64),
  ageConfirmed: z.literal(true, { error: "You must confirm you meet the age requirement" }),
  termsAccepted: z.literal(true, { error: "You must accept the Terms and Privacy Policy" }),
});

export const signInSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

export const forgotPasswordSchema = z.object({ email: z.email("Enter a valid email") });

export const resetPasswordSchema = z
  .object({
    password: z.string().min(10, "Use at least 10 characters").max(128),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords don't match", path: ["confirm"] });
