import "server-only";
import { serverEnv } from "@/lib/env";
import type { AdminClient } from "@/lib/supabase/admin";

/** Signed URLs for evidence are short-lived and never persisted. */
export const SIGNED_URL_TTL_SECONDS = 60;

export function evidencePath(userId: string, assignmentId: string, submissionId: string): string {
  return `${userId}/${assignmentId}/${submissionId}.webp`;
}

export async function uploadEvidence(db: AdminClient, path: string, body: Buffer, contentType: string) {
  const { error } = await db.storage.from(serverEnv().SUPABASE_STORAGE_BUCKET).upload(path, body, {
    contentType,
    upsert: false,
    cacheControl: "private, max-age=0",
  });
  if (error) throw new Error("evidence upload failed");
}

export async function signedEvidenceUrl(db: AdminClient, path: string): Promise<string | null> {
  const { data, error } = await db.storage
    .from(serverEnv().SUPABASE_STORAGE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function removeEvidence(db: AdminClient, paths: string[]) {
  if (paths.length === 0) return;
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await db.storage.from(serverEnv().SUPABASE_STORAGE_BUCKET).remove(paths.slice(i, i + 100));
    if (error) throw new Error("evidence removal failed");
  }
}
