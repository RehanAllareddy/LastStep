"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { AppError, userMessage } from "@/lib/db/errors";
import { assignmentActionSchema, assignmentFormSchema } from "@/lib/validation/assignment";
import { fail, fieldErrorsFrom, type ActionResult } from "@/lib/validation/common";
import {
  allowedChannelsFor,
  createAssignment,
  resolveDeadline,
  transitionAssignment,
  updateAssignment,
} from "./service";

function revalidateAssignments(id?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/assignments");
  if (id) revalidatePath(`/assignments/${id}`);
}

export async function createAssignmentAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = assignmentFormSchema.safeParse(input);
  if (!parsed.success)
    return fail("Please fix the highlighted fields.", "validation", fieldErrorsFrom(parsed.error.issues));
  const v = parsed.data;
  const deadline = resolveDeadline(v, new Date());
  if (deadline.kind === "invalid") return fail(deadline.message, "validation", { [deadline.field]: deadline.message });
  if (deadline.kind === "needs_recovery") {
    return fail("That deadline has already passed. Set a recovery target to keep going.", "deadline_passed");
  }
  try {
    await enforceRateLimit(`assignment-write:${user.id}`, RATE_LIMITS.assignmentWrite);
    const db = supabaseAdmin();
    const created = await createAssignment(
      db,
      user.id,
      v,
      deadline.kind === "recovery"
        ? { dueAt: deadline.dueAt, originalDueAt: deadline.originalDueAt }
        : { dueAt: deadline.dueAt },
      await allowedChannelsFor(db, user.id),
    );
    revalidateAssignments();
    return { ok: true, data: { id: created.id } };
  } catch (error) {
    return fail(userMessage(error), error instanceof AppError ? error.code : "internal");
  }
}

export async function updateAssignmentAction(
  assignmentId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = assignmentFormSchema.safeParse(input);
  if (!parsed.success)
    return fail("Please fix the highlighted fields.", "validation", fieldErrorsFrom(parsed.error.issues));
  const deadline = resolveDeadline(parsed.data, new Date());
  if (deadline.kind === "invalid") return fail(deadline.message, "validation", { [deadline.field]: deadline.message });
  if (deadline.kind === "needs_recovery") {
    return fail("Choose a deadline in the future to reschedule this assignment.", "deadline_in_past", {
      dueTime: "Choose a future date and time",
    });
  }
  try {
    await enforceRateLimit(`assignment-write:${user.id}`, RATE_LIMITS.assignmentWrite);
    const db = supabaseAdmin();
    const updated = await updateAssignment(
      db,
      user.id,
      assignmentId,
      parsed.data,
      deadline.dueAt,
      await allowedChannelsFor(db, user.id),
    );
    revalidateAssignments(updated.id);
    return { ok: true, data: { id: updated.id } };
  } catch (error) {
    return fail(userMessage(error), error instanceof AppError ? error.code : "internal");
  }
}

export async function assignmentLifecycleAction(input: unknown): Promise<ActionResult<{ status: string }>> {
  const user = await requireUser();
  const parsed = assignmentActionSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request.", "validation");
  try {
    await enforceRateLimit(`assignment-write:${user.id}`, RATE_LIMITS.assignmentWrite);
    const updated = await transitionAssignment(supabaseAdmin(), user.id, parsed.data.assignmentId, parsed.data.action);
    revalidateAssignments(updated.id);
    return { ok: true, data: { status: updated.status } };
  } catch (error) {
    return fail(userMessage(error), error instanceof AppError ? error.code : "internal");
  }
}
