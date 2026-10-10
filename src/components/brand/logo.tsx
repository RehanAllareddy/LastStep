import Link from "next/link";
import { cn } from "@/lib/utils";

/** LastStep mark: ascending steps leading to a final point — the last step. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)}>
      <rect width="32" height="32" rx="8" className="fill-accent" />
      <path
        d="M7 24h5.5v-5.5H18V13h5.5"
        fill="none"
        className="stroke-accent-foreground"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="23.5" cy="8.5" r="2.6" className="fill-accent-foreground" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("text-[17px] tracking-[-0.02em]", className)}>
      <span className="text-muted-foreground font-medium">Last</span>
      <span className="text-foreground font-semibold">Step</span>
    </span>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 rounded-md", className)} aria-label="LastStep home">
      <LogoMark />
      <Wordmark />
    </Link>
  );
}
