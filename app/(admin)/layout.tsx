import { redirect } from "next/navigation";
import { Sidebar } from "@/components/ui/Sidebar";
import { requireUser } from "@/lib/auth";
import { getCurrentProfile } from "@/lib/db/profile";
import { createClient } from "@/lib/supabase/server";

type ProfileRoleRow = {
  role: "user" | "admin";
};

export default async function AdminLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireUser();
  const currentProfile = await getCurrentProfile();
  const supabase = createClient();

  const { data: roleProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const profileRole = (roleProfile as ProfileRoleRow | null)?.role;

  if (profileRole !== "admin") {
    redirect("/logs");
  }

  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      <Sidebar
        profile={{
          displayName: currentProfile.displayName,
          email: currentProfile.email || user.email || "",
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
