import { redirect } from "next/navigation";
import { AppShell } from "@/components/ui/AppShell";
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
    <AppShell
      profile={{
        displayName: profile.displayName,
        email: profile.email,
        avatarColor: profile.avatarColor,
        isAdmin: true
      }}
    >
      {children}
    </AppShell>
  );
}
