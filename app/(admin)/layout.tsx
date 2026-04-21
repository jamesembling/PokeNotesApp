import { redirect } from "next/navigation";
import { Sidebar } from "@/components/ui/Sidebar";
import { getAdminAccessContext } from "@/lib/db/admin";
import { getDeckSelectionOptions } from "@/lib/db/decks";
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

  const [currentProfile, userDecks] = await Promise.all([
    getCurrentProfile(),
    getDeckSelectionOptions(user.id)
  ]);

  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      <Sidebar
        profile={{
          displayName: currentProfile.displayName,
          email: currentProfile.email || user.email || "",
          isAdmin: true
        }}
        userDecks={userDecks}
      />
      <main className="min-[860px]:pl-64">
        <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
