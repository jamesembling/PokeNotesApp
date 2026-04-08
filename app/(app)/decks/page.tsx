import { Card } from "@/components/ui/Card";
import { DeckCard } from "@/components/ui/DeckCard";
import { DeckEditorDialog } from "@/components/ui/DeckEditorDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireUser } from "@/lib/auth";
import { getDecks } from "@/lib/db/decks";
import { getPokemonOptions } from "@/lib/db/pokemon";

export default async function DecksPage() {
  const user = await requireUser();
  const [decks, pokemonOptions] = await Promise.all([getDecks(user.id), getPokemonOptions()]);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Deck Strategy" }]}
        showDivider={false}
        title="Deck Strategy"
        subtitle="Your saved deck strategies and battle records."
        action={<DeckEditorDialog pokemonOptions={pokemonOptions} triggerLabel="New Deck" />}
      />

      {decks.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--text-secondary)]">No decks saved yet.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {decks.map((deck) => (
            <DeckCard deck={deck} key={deck.id} />
          ))}
        </div>
      )}
    </>
  );
}
