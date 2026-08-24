import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/ui/AppShell";
import { AdminDashboardLoadingState } from "@/components/ui/AdminDashboardLoadingState";
import { ClientRouteTimingMarker } from "@/components/ui/ClientRouteTimingMarker";
import { RouteTimingMarker } from "@/components/ui/RouteTimingMarker";
import { SidebarAccount, SidebarAccountFallback } from "@/components/ui/Sidebar";
import { getAdminAccessContext } from "@/lib/db/admin";
import { measureServerCallWithTiming } from "@/lib/server/perf";

export default function AdminLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const adminContextPromise = measureAdminAccess();

  return (
    <AppShell
      account={
        <Suspense fallback={<SidebarAccountFallback />}>
          <AdminShellAccount adminContextPromise={adminContextPromise} />
        </Suspense>
      }
    >
      <Suspense fallback={<AdminDashboardLoadingState />}>
        <AuthorizedAdminContent adminContextPromise={adminContextPromise}>
          {children}
        </AuthorizedAdminContent>
      </Suspense>
    </AppShell>
  );
}

async function AdminShellAccount({
  adminContextPromise
}: {
  adminContextPromise: ReturnType<typeof measureAdminAccess>;
}) {
  const adminContextTiming = await adminContextPromise;
  const { profile, role } = adminContextTiming.value;

  if (role !== "admin") {
    return <SidebarAccountFallback />;
  }

  return (
    <>
      <SidebarAccount
        profile={{
          avatarColor: profile.avatarColor,
          displayName: profile.displayName,
          email: profile.email,
          isAdmin: true
        }}
      />
      <RouteTimingMarker durationMs={adminContextTiming.durationMs} phase="shell-profile" />
      <ClientRouteTimingMarker phase="shell-profile-loaded" />
    </>
  );
}

async function AuthorizedAdminContent({
  adminContextPromise,
  children
}: {
  adminContextPromise: ReturnType<typeof measureAdminAccess>;
  children: ReactNode;
}) {
  const adminContextTiming = await adminContextPromise;

  if (adminContextTiming.value.role !== "admin") {
    redirect("/logs");
  }

  return (
    <>
      <RouteTimingMarker durationMs={adminContextTiming.durationMs} phase="admin-access" />
      {children}
    </>
  );
}

function measureAdminAccess() {
  return measureServerCallWithTiming("page.admin.shell", () => getAdminAccessContext());
}
