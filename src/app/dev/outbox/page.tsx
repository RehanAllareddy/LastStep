import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Alert } from "@/components/ui/alert";
import { Logo } from "@/components/brand/logo";

export const metadata: Metadata = { title: "Simulated outbox" };

/** Development-only view of simulated notifications for the signed-in user. */
export default async function DevOutboxPage() {
  const env = serverEnv();
  if (env.NOTIFICATION_PROVIDER !== "simulated" || env.APP_ENV === "production") notFound();
  const user = await requireUser();
  const { data } = await supabaseAdmin()
    .from("dev_outbox")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <Logo href="/dashboard" />
      <h1 className="text-2xl font-semibold tracking-tight">Simulated outbox</h1>
      <Alert tone="warning" title="SIMULATED — nothing here was sent">
        These entries were written by the development notification provider. No text was sent and no call was placed.
      </Alert>
      {!data?.length ? (
        <p className="text-muted-foreground text-sm">
          Nothing yet. Verify a phone or wait for a reminder to be dispatched.
        </p>
      ) : (
        <ul className="space-y-3">
          {data.map((m) => (
            <li key={m.id} className="border-warning/40 bg-surface rounded-[12px] border border-dashed p-4 text-sm">
              <p className="text-muted-foreground text-xs">
                {new Date(m.created_at).toISOString()} · {m.channel} · to {m.to_masked}
                {m.kind ? ` · ${m.kind}` : ""}
              </p>
              <p className="mt-1.5 font-mono text-[13px]">{m.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
