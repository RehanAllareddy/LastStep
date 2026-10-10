import { requireOnboardedUser, getAdminRoles } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env";
import { AppShell } from "@/components/layout/app-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await requireOnboardedUser();
  const roles = await getAdminRoles(user.id);
  return (
    <AppShell
      name={profile.display_name}
      email={user.email}
      isAdmin={roles.length > 0}
      simulated={serverEnv().NOTIFICATION_PROVIDER === "simulated"}
    >
      {children}
    </AppShell>
  );
}
