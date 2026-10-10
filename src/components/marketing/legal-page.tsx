import { Alert } from "@/components/ui/alert";

export function LegalPage({ title, version, children }: { title: string; version: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-[-0.025em]">{title}</h1>
      <p className="text-subtle-foreground mt-2 text-sm">Version: {version}</p>
      <Alert tone="warning" title="Implementation draft — not yet reviewed" className="mt-6">
        This document was written alongside the software to describe how LastStep actually behaves. It has not been
        reviewed by legal counsel and must be reviewed and adapted (including for privacy, child-protection,
        telecommunications and automated-calling rules in each launch jurisdiction) before public launch.
      </Alert>
      <div className="text-muted-foreground [&_h2]:text-foreground mt-10 space-y-8 text-[15px] leading-relaxed [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_li]:mt-1.5 [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-3">
        {children}
      </div>
    </article>
  );
}
