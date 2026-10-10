import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AppError } from "@/lib/db/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { isSameOrigin } from "@/lib/security/origin";
import { MAX_UPLOAD_BYTES } from "@/lib/submissions/image";
import { submitEvidence } from "@/lib/submissions/service";
import { revalidatePath } from "next/cache";

/** Multipart upload of completion evidence (field "file", "selfAttested"). */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return Response.json({ error: "Invalid origin." }, { status: 403 });
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Not found." }, { status: 404 });

  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_UPLOAD_BYTES + 64 * 1024) {
    return Response.json({ error: "That file is larger than 4 MB. Try a smaller screenshot." }, { status: 413 });
  }

  try {
    await enforceRateLimit(`upload:${user.id}`, RATE_LIMITS.submissionUpload);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Choose a screenshot to upload." }, { status: 400 });
    if (file.size > MAX_UPLOAD_BYTES) {
      return Response.json({ error: "That file is larger than 4 MB. Try a smaller screenshot." }, { status: 413 });
    }
    const selfAttested = form.get("selfAttested") === "true";
    const outcome = await submitEvidence(
      supabaseAdmin(),
      user.id,
      id,
      Buffer.from(await file.arrayBuffer()),
      selfAttested,
    );
    revalidatePath("/dashboard");
    revalidatePath("/assignments");
    revalidatePath(`/assignments/${id}`);
    revalidatePath("/completed");
    return Response.json({
      status: outcome.assignment.status,
      submissionStatus: outcome.submission.status,
      canceledReminders: outcome.canceledJobs,
    });
  } catch (error) {
    if (error instanceof AppError) {
      const status = error.code === "not_found" ? 404 : error.code === "rate_limited" ? 429 : 400;
      return Response.json({ error: error.userMessage, code: error.code }, { status });
    }
    console.error("[upload] unexpected failure");
    return Response.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
