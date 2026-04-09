import { Sidebar } from "@/components/ui/Sidebar";
import { requireUser } from "@/lib/auth";
import { getCurrentProfile } from "@/lib/db/profile";

export default async function AppLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireUser();
  const profile = await getCurrentProfile();

  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      <Sidebar
        profile={{
          displayName: profile.displayName,
          email: profile.email || user.email || ""
        }}
      />
      <main className="min-[860px]:pl-64">
        <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
