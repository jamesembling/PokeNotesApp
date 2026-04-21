import { Suspense } from "react";
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
  const decksPromise = getDecks(user.id);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Deck Strategy" }]}
        showDivider={false}
        title="Deck Strategy"
        action={<LazyDeckEditorButton triggerLabel="New Deck" />}
      />

      <Suspense fallback={<DecksContentFallback />}>
        <DecksContent decksPromise={decksPromise} userId={user.id} />
      </Suspense>
    </>
  );
}

async function DecksContent({
  decksPromise,
  userId
}: {
  decksPromise: ReturnType<typeof getDecks>;
  userId: string;
}) {
  const decks = await decksPromise;
  const deckStatsByDeck = await measureServerCall("page.decks.data", async () =>
    await getDeckStatsForIndex(userId, decks)
  );
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

  if (decks.length === 0) {
    return (
      <Card>
        <p className="text-sm text-[var(--text-secondary)]">No decks saved yet.</p>
      </Card>
    );
  }

  return <DeckStrategyCollection decks={deckCardData} />;
}

function DecksContentFallback() {
  return (
    <Card>
      <div className="grid gap-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            className="h-32 animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--bg-surface-alt)]"
            key={index}
          />
        ))}
      </div>
    </Card>
  );
}
