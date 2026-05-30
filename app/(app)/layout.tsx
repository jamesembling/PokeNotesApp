import { cookies } from "next/headers";
import { AppShell } from "@/components/ui/AppShell";
import { requireUser } from "@/lib/auth";
import { normalizeAvatarColor, PROFILE_AVATAR_COOKIE } from "@/lib/profile-avatar";

function getFallbackDisplayName(user: Awaited<ReturnType<typeof requireUser>>) {
  return (
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "Trainer"
  );
}

function getAuthClaimIsAdmin(user: Awaited<ReturnType<typeof requireUser>>) {
  return user.app_metadata?.role === "admin";
}

export default async function AppLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [user, cookieStore] = await Promise.all([requireUser(), cookies()]);
  const avatarColor = normalizeAvatarColor(
    cookieStore.get(PROFILE_AVATAR_COOKIE)?.value || String(user.user_metadata?.avatar_color || "")
  );

  return (
    <AppShell
      profile={{
        displayName: getFallbackDisplayName(user),
        email: user.email ?? "",
        avatarColor,
        isAdmin: getAuthClaimIsAdmin(user)
      }}
    >
      {children}
    </AppShell>
  );
}
