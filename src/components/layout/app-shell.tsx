"use client";

import * as React from "react";
import { LogOut, Menu } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, SheetContent } from "@/components/ui/dialog";
import { ThemeToggle } from "./theme";
import { AppNav } from "./app-nav";
import { signOutAction } from "@/lib/auth/actions";

export function AppShell({
  name,
  email,
  isAdmin,
  simulated,
  children,
}: {
  name: string;
  email: string | null;
  isAdmin: boolean;
  simulated: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const footer = (
    <div className="border-border space-y-3 border-t pt-4">
      <div className="min-w-0 px-1">
        <p className="truncate text-sm font-medium">{name || "Student"}</p>
        {email && <p className="text-muted-foreground truncate text-xs">{email}</p>}
      </div>
      <div className="flex items-center justify-between gap-2">
        <ThemeToggle />
        <form action={signOutAction}>
          <Button type="submit" variant="ghost" size="sm">
            <LogOut /> Sign out
          </Button>
        </form>
      </div>
    </div>
  );
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_1fr]">
      <a
        href="#main"
        className="focus:bg-surface sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <aside className="border-border bg-surface sticky top-0 hidden h-dvh flex-col border-r p-4 lg:flex">
        <div className="px-2 pt-1 pb-6">
          <Logo href="/dashboard" />
        </div>
        <AppNav isAdmin={isAdmin} />
        <div className="mt-auto">{footer}</div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="border-border bg-background/90 sticky top-0 z-30 flex h-14 items-center justify-between border-b px-4 backdrop-blur lg:hidden">
          <Logo href="/dashboard" />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open navigation">
                <Menu />
              </Button>
            </DialogTrigger>
            <SheetContent aria-describedby={undefined}>
              <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
              <div className="pb-6">
                <Logo href="/dashboard" />
              </div>
              <AppNav isAdmin={isAdmin} onNavigate={() => setOpen(false)} />
              <div className="mt-auto">{footer}</div>
            </SheetContent>
          </Dialog>
        </header>
        {simulated && (
          <div className="border-warning/25 bg-warning-soft text-warning border-b px-4 py-2 text-center text-xs sm:px-8">
            Development mode: notifications are simulated and never sent.{" "}
            <a href="/dev/outbox" className="font-medium underline underline-offset-2">
              View simulated outbox
            </a>
          </div>
        )}
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-8 sm:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
