import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
  return (
    <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-[-0.025em]">Contact</h1>
      <p className="text-muted-foreground mt-3">
        Questions about your account, privacy, or reminders? We&apos;re here to help.
      </p>
      <Card className="mt-8">
        <CardContent className="space-y-4">
          {email ? (
            <p>
              Email us at <span className="text-foreground font-medium">{email}</span>{" "}
              <a href={`mailto:${email}`} className="text-accent underline-offset-4 hover:underline">
                (open mail app)
              </a>
            </p>
          ) : (
            <p className="text-muted-foreground">
              A support address hasn&apos;t been configured for this deployment yet (set NEXT_PUBLIC_SUPPORT_EMAIL).
            </p>
          )}
          <p className="text-muted-foreground text-sm">
            To stop texts right away, reply STOP to any LastStep message. To delete your data, use Account Settings →
            Delete account.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
