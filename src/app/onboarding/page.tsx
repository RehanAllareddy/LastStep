import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser, getProfile } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env";
import { loadNotificationState, preferencesToForm } from "@/lib/notifications/queries";
import { supportedTimeZones } from "@/lib/time/zones";
import { Logo } from "@/components/brand/logo";
import { OnboardingFlow } from "./onboarding-flow";

export const metadata: Metadata = { title: "Set up" };

export default async function OnboardingPage() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  if (!profile) redirect("/sign-in");
  if (profile.onboarding_completed) redirect("/dashboard");
  const state = await loadNotificationState(user.id);
  if (!state.prefs) redirect("/sign-in");
  const env = serverEnv();
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6">
        <Logo href="/onboarding" />
      </header>
      <main id="main" className="mx-auto max-w-2xl px-4 pt-4 pb-20 sm:px-6">
        <OnboardingFlow
          name={profile.display_name}
          phone={state.phone}
          hasConsent={Boolean(state.smsConsent || state.voiceConsent)}
          preferences={preferencesToForm(state.prefs)}
          timeZones={supportedTimeZones()}
          voiceAvailable={env.voiceConfigured}
          simulated={env.NOTIFICATION_PROVIDER === "simulated"}
        />
      </main>
    </div>
  );
}
