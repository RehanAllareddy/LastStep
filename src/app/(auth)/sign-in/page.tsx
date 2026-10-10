import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/layout/auth-card";
import { Alert } from "@/components/ui/alert";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  link_invalid: "That link is invalid or has expired. Sign in, or request a new link.",
  reset_link_invalid: "That password reset link is invalid or has expired. Request a new one.",
  account_unavailable: "This account is no longer available.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { next, error, reset } = await searchParams;
  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to see today's commitments."
      footer={
        <>
          New to LastStep?{" "}
          <Link href="/sign-up" className="text-accent font-medium hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      {error && ERRORS[error] && (
        <Alert tone="danger" className="mb-5">
          {ERRORS[error]}
        </Alert>
      )}
      {reset === "1" && (
        <Alert tone="success" className="mb-5">
          Password updated. Sign in with your new password.
        </Alert>
      )}
      <SignInForm next={next} />
    </AuthCard>
  );
}
