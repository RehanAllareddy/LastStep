import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/layout/theme";

const LINKS = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/sms-terms", label: "SMS Terms and Consent" },
  { href: "/contact", label: "Contact" },
  { href: "/sign-in", label: "Sign In" },
];

export function SiteFooter() {
  return (
    <footer className="border-border bg-surface border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xs space-y-3">
          <Logo />
          <p className="text-muted-foreground text-sm">Stop scrolling. Start finishing.</p>
          <ThemeToggle />
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm sm:grid-cols-3">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-muted-foreground hover:text-foreground">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="text-subtle-foreground mx-auto max-w-6xl px-4 pb-8 text-xs sm:px-6">
        © {new Date().getFullYear()} LastStep. Legal documents on this site are implementation drafts pending legal
        review.
      </div>
    </footer>
  );
}
