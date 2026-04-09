import { Card } from "@/components/ui/Card";
import { DeckCard } from "@/components/ui/DeckCard";
import { LazyDeckEditorButton } from "@/components/ui/LazyDeckEditorButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireUser } from "@/lib/auth";
import { getBattleLogSummaryStats, getAllLogsForDeck } from "@/lib/db/logs";
import { getDecks } from "@/lib/db/decks";

export default async function DecksPage() {
  const user = await requireUser();
  const decks = await getDecks(user.id);
  const deckCardData = await Promise.all(
    decks.map(async (deck) => {
      const stats = getBattleLogSummaryStats(await getAllLogsForDeck(user.id, deck.id, decks));
      const winRate = stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : 0;

      return {
        deck,
        deckListCount: deck.deckLists.length,
        winRateLabel: stats.total > 0 ? `${winRate}% (${stats.wins}-${stats.losses})` : "No logs yet"
      };
    })
  );

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Deck Strategy" }]}
        showDivider={false}
        title="Deck Strategy"
        subtitle="Your saved deck strategies and battle records."
        action={<LazyDeckEditorButton triggerLabel="New Deck" />}
      />

      {decks.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--text-secondary)]">No decks saved yet.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {deckCardData.map(({ deck, deckListCount, winRateLabel }) => (
            <DeckCard
              deck={deck}
              deckListCount={deckListCount}
              key={deck.id}
              winRateLabel={winRateLabel}
            />
          ))}
        </div>
      )}
    </>
  );
}
