import { redirect } from "next/navigation";
import { Sidebar } from "@/components/ui/Sidebar";
import { getAdminAccessContext } from "@/lib/db/admin";

export default async function AdminLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { profile, role } = await getAdminAccessContext();

  if (role !== "admin") {
    redirect("/logs");
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        profile={{
          displayName: profile.displayName,
          email: profile.email,
          isAdmin: true
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
