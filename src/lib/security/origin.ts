import "server-only";
import { publicEnv } from "@/lib/env";

/**
 * CSRF defense for cookie-authenticated route handlers (Server Actions get
 * this from Next.js automatically): require a same-origin Origin header.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const allowed = new Set([new URL(publicEnv().NEXT_PUBLIC_APP_URL).origin, new URL(request.url).origin]);
  return allowed.has(origin);
}
