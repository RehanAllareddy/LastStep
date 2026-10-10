import { z } from "zod";
import { getSessionUser, getAdminRoles } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { signedEvidenceUrl } from "@/lib/storage/evidence";

/**
 * Reviewer access to evidence. Restricted to the "reviewer" role, only for
 * submissions currently pending review, and every access is audited.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!(await getAdminRoles(user.id)).includes("reviewer")) return new Response("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });
  const db = supabaseAdmin();
  const { data } = await db.from("submissions").select("storage_path, status, deleted_at").eq("id", id).maybeSingle();
  if (!data || data.deleted_at || data.status !== "pending_review") return new Response("Not found", { status: 404 });
  await db
    .from("admin_audit_log")
    .insert({ actor_id: user.id, action: "submission.view_evidence", target_type: "submission", target_id: id });
  const url = await signedEvidenceUrl(db, data.storage_path);
  if (!url) return new Response("Not found", { status: 404 });
  return new Response(null, { status: 302, headers: { location: url, "cache-control": "no-store" } });
}
