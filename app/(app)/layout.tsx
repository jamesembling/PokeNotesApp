import { cookies } from "next/headers";
import { Sidebar, SidebarMobileTopbar } from "@/components/ui/Sidebar";
import { RoutePerformanceReporter } from "@/components/ui/RoutePerformanceReporter";
import { SidebarInset, SidebarProvider } from "@/components/shadcn/sidebar";
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
  const user = await requireUser();
  const cookieStore = await cookies();
  const avatarColor = normalizeAvatarColor(
    cookieStore.get(PROFILE_AVATAR_COOKIE)?.value || String(user.user_metadata?.avatar_color || "")
  );

  return (
    <SidebarProvider>
      <Sidebar
        profile={{
          displayName: getFallbackDisplayName(user),
          email: user.email ?? "",
          avatarColor,
          isAdmin: getAuthClaimIsAdmin(user)
        }}
      />
      <SidebarInset>
        <SidebarMobileTopbar />
        <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-6">{children}</div>
        </div>
      </SidebarInset>
      <RoutePerformanceReporter />
    </SidebarProvider>
  );
}
