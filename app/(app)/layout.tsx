import { cookies } from "next/headers";
import { AppShell } from "@/components/ui/AppShell";
import { getCurrentSidebarProfile } from "@/lib/db/profile";
import { normalizeAvatarColor, PROFILE_AVATAR_COOKIE } from "@/lib/profile-avatar";

export default async function AppLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [profile, cookieStore] = await Promise.all([getCurrentSidebarProfile(), cookies()]);
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
    >
      {children}
    </AppShell>
  );
}
