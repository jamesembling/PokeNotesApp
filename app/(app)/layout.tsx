import { Sidebar } from "@/components/ui/Sidebar";
import { requireUser } from "@/lib/auth";
import { getDecks } from "@/lib/db/decks";
import { getPokemonOptions } from "@/lib/db/pokemon";

export default async function AppLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireUser();
  const [userDecks, pokemonOptions] = await Promise.all([
    getDecks(user.id),
    getPokemonOptions()
  ]);

  const displayName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "Trainer";
  const email = user.email || "";

  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      <Sidebar
        pokemonOptions={pokemonOptions}
        profile={{ displayName, email }}
        userDecks={userDecks}
        userId={user.id}
      />
      <main className="min-[860px]:pl-64">
        <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="mx-auto flex max-w-5xl flex-col gap-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
