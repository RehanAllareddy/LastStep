import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";
import type { Database } from "@/types/database";

export type AdminClient = SupabaseClient<Database>;

let client: AdminClient | undefined;

/**
 * Service-role client. Bypasses RLS: use only in server code after the caller
 * has been authenticated and authorized. Never import from client components.
 */
export function supabaseAdmin(): AdminClient {
  if (client) return client;
  client = createClient<Database>(publicEnv().NEXT_PUBLIC_SUPABASE_URL, serverEnv().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}
