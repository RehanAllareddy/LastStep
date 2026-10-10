"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Bell, CheckCircle2, LayoutDashboard, ListTodo, Plus, Settings, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/assignments", label: "My Assignments", icon: ListTodo, exact: true },
  { href: "/assignments/new", label: "Create Assignment", icon: Plus, exact: true },
  { href: "/completed", label: "Completed Work", icon: CheckCircle2 },
  { href: "/progress", label: "Progress", icon: BarChart3 },
  { href: "/settings/notifications", label: "Notification Settings", icon: Bell },
  { href: "/settings/account", label: "Account Settings", icon: Settings },
];

export function AppNav({ isAdmin, onNavigate }: { isAdmin: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const items = isAdmin ? [...NAV_ITEMS, { href: "/admin", label: "Operations", icon: Shield }] : NAV_ITEMS;
  return (
    <nav aria-label="App" className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active =
          "exact" in item && item.exact
            ? pathname === item.href || (item.href === "/assignments" && /^\/assignments\/(?!new)[^/]+/.test(pathname))
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-[9px] px-3 py-2 text-sm transition-colors",
              active
                ? "bg-accent-soft text-accent-soft-foreground font-medium"
                : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
            )}
          >
            <item.icon className="size-4" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
