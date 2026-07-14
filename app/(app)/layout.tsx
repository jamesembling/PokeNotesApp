import { cookies } from "next/headers";
import { AppShell } from "@/components/ui/AppShell";
import { getCurrentSidebarProfile } from "@/lib/db/profile";
import { normalizeAvatarColor, PROFILE_AVATAR_COOKIE } from "@/lib/profile-avatar";
import { measureServerCallWithTiming } from "@/lib/server/perf";

export default async function AppLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [profileTiming, cookieStore] = await Promise.all([
    measureServerCallWithTiming("page.shell.profile", () => getCurrentSidebarProfile()),
    cookies()
  ]);
  const profile = profileTiming.value;
  const avatarColor = normalizeAvatarColor(
    cookieStore.get(PROFILE_AVATAR_COOKIE)?.value || profile.avatarColor
  );

  return (
    <AppShell
      profile={{
        displayName: profile.displayName,
        email: profile.email,
        avatarColor,
        isAdmin: profile.role === "admin"
      }}
      shellProfileDurationMs={profileTiming.durationMs}
    >
      {children}
    </AppShell>
  );
}
