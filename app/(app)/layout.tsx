import { redirect } from "next/navigation";
import { Sidebar } from "@/components/ui/Sidebar";
import { createClient } from "@/lib/supabase/server";

type ProfileRow = {
  display_name: string;
  email: string;
};

export default async function AppLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name,email")
    .eq("id", user.id)
    .single();

  const typedProfile = profile as ProfileRow | null;
  const displayName =
    typedProfile?.display_name ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "Trainer";
  const email = typedProfile?.email || user.email || "";

  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      <Sidebar profile={{ displayName, email }} />
      <main className="min-[860px]:pl-64">
        <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="mx-auto flex max-w-5xl flex-col gap-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
