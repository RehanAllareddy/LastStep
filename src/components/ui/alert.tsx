import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "flex gap-3 rounded-[12px] border p-4 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      tone: {
        info: "border-accent/20 bg-info-soft text-foreground [&>svg]:text-info",
        success: "border-success/20 bg-success-soft text-foreground [&>svg]:text-success",
        warning: "border-warning/25 bg-warning-soft text-foreground [&>svg]:text-warning",
        danger: "border-danger/25 bg-danger-soft text-foreground [&>svg]:text-danger",
      },
    },
    defaultVariants: { tone: "info" },
  },
);

const ICONS = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle };

export function Alert({
  className,
  tone = "info",
  title,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & VariantProps<typeof alertVariants> & { title?: React.ReactNode }) {
  const Icon = ICONS[tone ?? "info"];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn(alertVariants({ tone }), className)} {...props}>
      <Icon aria-hidden />
      <div className="space-y-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="text-muted-foreground">{children}</div>}
      </div>
    </div>
  );
}
