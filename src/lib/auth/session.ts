import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export interface SessionUser {
  id: string;
  email: string | null;
}

/** Verified identity from the session JWT (getClaims validates the signature). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return { id: data.claims.sub, email: (data.claims.email as string | undefined) ?? null };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return user;
}

export const getProfile = cache(async (userId: string): Promise<Profile | null> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  return data;
});

/** For dashboard pages: signed in, account active, onboarding finished. */
export async function requireOnboardedUser(): Promise<{ user: SessionUser; profile: Profile }> {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  if (!profile || profile.deletion_requested_at) redirect("/sign-in?error=account_unavailable");
  if (!profile.onboarding_completed) redirect("/onboarding");
  return { user, profile };
}

export type AdminRole = "ops" | "reviewer";

/** Explicit role check against app_admins (service-role read; table is not user-readable). */
export async function getAdminRoles(userId: string): Promise<AdminRole[]> {
  const { data } = await supabaseAdmin().from("app_admins").select("role").eq("user_id", userId);
  return (data ?? []).map((r) => r.role as AdminRole);
}

export async function requireAdmin(role?: AdminRole): Promise<{ user: SessionUser; roles: AdminRole[] }> {
  const user = await requireUser();
  const roles = await getAdminRoles(user.id);
  if (roles.length === 0 || (role && !roles.includes(role))) redirect("/dashboard");
  return { user, roles };
}
