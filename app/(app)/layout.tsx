import { cookies } from "next/headers";
import { AppShell, type AppShellProfileResult } from "@/components/ui/AppShell";
import { getCurrentSidebarProfile } from "@/lib/db/profile";
import { normalizeAvatarColor, PROFILE_AVATAR_COOKIE } from "@/lib/profile-avatar";
import { measureServerCallWithTiming } from "@/lib/server/perf";

async function loadAppShellProfile(): Promise<AppShellProfileResult> {
  const [profileTiming, cookieStore] = await Promise.all([
    measureServerCallWithTiming("page.shell.profile", () => getCurrentSidebarProfile()),
    cookies()
  ]);
  const profile = profileTiming.value;
  const avatarColor = normalizeAvatarColor(
    cookieStore.get(PROFILE_AVATAR_COOKIE)?.value || profile.avatarColor
  );

  return {
    durationMs: profileTiming.durationMs,
    profile: {
      displayName: profile.displayName,
      email: profile.email,
      avatarColor,
      isAdmin: profile.role === "admin"
    }
  };
}

export default function AppLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const profilePromise = loadAppShellProfile();

  return (
    <AppShell profilePromise={profilePromise}>
      {children}
    </AppShell>
  );
}
