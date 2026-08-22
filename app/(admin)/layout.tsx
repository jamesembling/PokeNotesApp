import { redirect } from "next/navigation";
import { AppShell } from "@/components/ui/AppShell";
import { getAdminAccessContext } from "@/lib/db/admin";
import { measureServerCallWithTiming } from "@/lib/server/perf";

export default async function AdminLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const adminContextTiming = await measureServerCallWithTiming("page.admin.shell", () =>
    getAdminAccessContext()
  );
  const { profile, role } = adminContextTiming.value;

  if (role !== "admin") {
    redirect("/logs");
  }

  return (
    <AppShell
      initialProfileResult={{
        durationMs: adminContextTiming.durationMs,
        profile: {
          displayName: profile.displayName,
          email: profile.email,
          avatarColor: profile.avatarColor,
          isAdmin: true
        }
      }}
    >
      {children}
    </AppShell>
  );
}
