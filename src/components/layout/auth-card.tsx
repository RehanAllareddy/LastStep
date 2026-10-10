import { Card } from "@/components/ui/card";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <>
      <Card className="p-6 shadow-[var(--shadow-raised)] sm:p-8">
        <h1 className="text-xl font-semibold tracking-[-0.02em]">{title}</h1>
        {description && <p className="text-muted-foreground mt-1.5 text-sm">{description}</p>}
        <div className="mt-6">{children}</div>
      </Card>
      {footer && <p className="text-muted-foreground mt-6 text-center text-sm">{footer}</p>}
    </>
  );
}
