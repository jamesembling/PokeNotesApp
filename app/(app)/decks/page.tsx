import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { DeckCard } from "@/components/ui/DeckCard";
import { getDecks } from "@/lib/db/decks";
import { createClient } from "@/lib/supabase/server";

export default async function DecksPage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const decks = user ? await getDecks(user.id) : [];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Deck Strategy" }]}
        title="Deck Strategy"
        subtitle="Your saved deck strategies and battle records."
        action={<Button disabled>New Deck</Button>}
      />

      {decks.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--text-secondary)]">No decks saved yet.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {decks.map((deck) => (
            <DeckCard deck={deck} key={deck.id} />
          ))}
        </div>
      )}
    </>
  );
}
