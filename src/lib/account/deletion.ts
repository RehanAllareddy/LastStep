import "server-only";
import type { AdminClient } from "@/lib/supabase/admin";
import { removeEvidence } from "@/lib/storage/evidence";

/**
 * Account deletion, ordered so nothing can message the user once it starts:
 *  1. prepare_account_deletion: flag the profile, revoke every consent,
 *     cancel scheduled AND in-flight jobs, deactivate phone numbers. The
 *     dispatcher's final SQL check refuses flagged accounts, so even a retry
 *     or a delayed webhook cannot send afterwards.
 *  2. Remove private evidence objects from storage.
 *  3. Delete the auth user; foreign keys cascade to every user-owned row.
 * Retained after deletion: the HMAC-only phone suppression entry (if the
 * number texted STOP) and admin audit rows (actor set to null).
 */
export async function deleteAccount(db: AdminClient, userId: string) {
  const { data: paths, error } = await db.rpc("prepare_account_deletion", { p_user_id: userId });
  if (error) throw new Error("prepare_account_deletion failed");
  await removeEvidence(db, paths ?? []);
  const { error: deleteError } = await db.auth.admin.deleteUser(userId);
  if (deleteError) throw new Error("auth user deletion failed");
}
