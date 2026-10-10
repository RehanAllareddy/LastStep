import "server-only";
import { headers } from "next/headers";

/** Audit metadata for consent records: truncated, no fingerprinting. */
export async function auditMetadata(): Promise<{ ip: string | null; user_agent: string | null }> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  const ua = h.get("user-agent");
  return { ip: ip ? ip.slice(0, 64) : null, user_agent: ua ? ua.slice(0, 256) : null };
}

export async function clientIp(): Promise<string> {
  return (await auditMetadata()).ip ?? "unknown";
}
