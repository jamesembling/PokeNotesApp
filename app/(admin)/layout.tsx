import { redirect } from "next/navigation";
import { Sidebar, SidebarMobileTopbar } from "@/components/ui/Sidebar";
import { SidebarInset, SidebarProvider } from "@/components/shadcn/sidebar";
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
    <SidebarProvider>
      <Sidebar
        profile={{
          displayName: profile.displayName,
          email: profile.email,
          avatarColor: profile.avatarColor,
          isAdmin: true
        }}
      />
      <SidebarInset>
        <SidebarMobileTopbar />
        <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-6">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
