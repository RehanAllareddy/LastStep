import { getSessionUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exportUserData } from "@/lib/account/export";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  try {
    await enforceRateLimit(`export:${user.id}`, RATE_LIMITS.dataExport);
  } catch {
    return new Response("Too many export requests. Try again later.", { status: 429 });
  }
  const data = await exportUserData(supabaseAdmin(), user.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="laststep-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
