import { Card } from "@/components/ui/Card";
import { DeckStrategyCollection } from "@/components/ui/DeckStrategyCollection";
import { LazyDeckEditorButton } from "@/components/ui/LazyDeckEditorButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireUser } from "@/lib/auth";
import { getDeckStatsForIndex } from "@/lib/db/logs";
import { getDecks } from "@/lib/db/decks";
import { measureServerCall } from "@/lib/server/perf";

export default async function DecksPage() {
  const user = await requireUser();
  const [decks, deckStatsByDeck] = await measureServerCall("page.decks.data", async () => {
    const decks = await getDecks(user.id);
    const deckStatsByDeck = await getDeckStatsForIndex(user.id, decks);

    return [decks, deckStatsByDeck] as const;
  });
  const deckCardData = decks.map((deck) => {
    const stats = deckStatsByDeck.get(deck.id) ?? {
      total: 0,
      wins: 0,
      losses: 0
    };
    const winRate = stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : 0;

    return {
      deck,
      gamesPlayed: stats.total,
      deckListCount: deck.deckLists.length,
      losses: stats.losses,
      winRate: stats.total > 0 ? winRate : null
    };
  });

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Deck Strategy" }]}
        showDivider={false}
        title="Deck Strategy"
        action={<LazyDeckEditorButton triggerLabel="New Deck" />}
      />

      {decks.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--text-secondary)]">No decks saved yet.</p>
        </Card>
      ) : (
        <DeckStrategyCollection decks={deckCardData} />
      )}
    </>
  );
}
