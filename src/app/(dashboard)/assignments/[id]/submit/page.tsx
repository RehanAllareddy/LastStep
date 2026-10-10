import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireOnboardedUser } from "@/lib/auth/session";
import { getAssignment } from "@/lib/assignments/queries";
import { canSubmit } from "@/lib/assignments/state-machine";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/layout/page-header";
import { UploadForm } from "@/components/submissions/upload-form";

export const metadata: Metadata = { title: "Submit work" };

export default async function SubmitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireOnboardedUser();
  const a = await getAssignment(id);
  if (!a) notFound();
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link
        href={`/assignments/${id}`}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> {a.title}
      </Link>
      <PageHeader
        title="Submit your work"
        description="Upload a screenshot that shows the finished assignment. It's stored privately."
      />
      <Card>
        <CardContent>
          {canSubmit(a.status) ? (
            <UploadForm assignmentId={a.id} policy={a.completion_policy} />
          ) : (
            <Alert tone="info" title="Not accepting submissions">
              This assignment is {a.status.replace("_", " ")}.{" "}
              <Link href={`/assignments/${id}`} className="text-accent hover:underline">
                Back to assignment
              </Link>
            </Alert>
          )}
        </CardContent>
      </Card>
      <p className="text-muted-foreground text-[13px]">
        A screenshot is a record of your own follow-through — LastStep doesn&apos;t claim it proves academic completion,
        and it never connects to your school accounts.
      </p>
    </div>
  );
}
