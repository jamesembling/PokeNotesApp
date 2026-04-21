import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/ui/Sidebar";
import { getAdminAccessContext } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/profile";

export default async function AdminLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { role, user } = await getAdminAccessContext();

  if (role !== "admin") {
    redirect("/logs");
  }

  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      <Suspense fallback={<AdminSidebarFallback />}>
        <AdminSidebar userEmail={user.email || ""} />
      </Suspense>
      <main className="min-[860px]:pl-64">
        <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-6">{children}</div>
        </div>
      </main>
    </div>
  );
}

async function AdminSidebar({ userEmail }: { userEmail: string }) {
  const currentProfile = await getCurrentProfile();

  return (
    <Sidebar
      profile={{
        displayName: currentProfile.displayName,
        email: currentProfile.email || userEmail,
        isAdmin: true
      }}
    />
  );
}

function AdminSidebarFallback() {
  return (
    <>
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-[var(--border)] bg-[var(--bg-surface)] min-[860px]:flex">
        <div className="flex w-full flex-col px-4 py-6">
          <div className="h-12 w-12 animate-pulse rounded-full bg-[var(--bg-surface-alt)]" />
          <div className="mt-8 space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                className="h-10 animate-pulse rounded-lg bg-[var(--bg-surface-alt)]"
                key={index}
              />
            ))}
          </div>
          <div className="mt-auto space-y-3 border-t border-[var(--border)] pt-4">
            <div className="h-12 animate-pulse rounded-lg bg-[var(--bg-surface-alt)]" />
            <div className="h-10 animate-pulse rounded-lg bg-[var(--bg-surface-alt)]" />
          </div>
        </div>
      </aside>

      <div className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3 min-[860px]:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="h-9 w-9 animate-pulse rounded-lg bg-[var(--bg-surface-alt)]" />
          <div className="h-12 w-12 animate-pulse rounded-full bg-[var(--bg-surface-alt)]" />
          <div className="h-9 w-9 animate-pulse rounded-lg bg-[var(--bg-surface-alt)]" />
        </div>
      </div>
    </>
  );
}
