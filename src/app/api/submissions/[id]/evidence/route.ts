import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { signedEvidenceUrl } from "@/lib/storage/evidence";

/** Owner-only access to their evidence through a 60-second signed URL. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });
  // RLS: the user-scoped query only returns the caller's own submission.
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("submissions").select("storage_path, deleted_at").eq("id", id).maybeSingle();
  if (!data || data.deleted_at) return new Response("Not found", { status: 404 });
  const url = await signedEvidenceUrl(supabaseAdmin(), data.storage_path);
  if (!url) return new Response("Not found", { status: 404 });
  return new Response(null, { status: 302, headers: { location: url, "cache-control": "no-store" } });
}
