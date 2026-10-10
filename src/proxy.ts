import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Skip static assets, images, and machine endpoints (webhooks, Inngest,
    // internal cron) which authenticate with signatures instead of cookies.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|api/webhooks|api/inngest|api/internal|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
