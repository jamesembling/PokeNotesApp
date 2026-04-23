import { Suspense } from "react";
import { Card } from "@/components/ui/Card";
import { DeckStrategyCollection } from "@/components/ui/DeckStrategyCollection";
import { LazyDeckEditorButton } from "@/components/ui/LazyDeckEditorButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireUser } from "@/lib/auth";
import { getDeckIndexSummaries } from "@/lib/db/decks";

export default async function DecksPage() {
  const user = await requireUser();
  const decksPromise = getDeckIndexSummaries(user.id);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Deck Strategy" }]}
        showDivider={false}
        title="Deck Strategy"
        action={<LazyDeckEditorButton triggerLabel="New Deck" />}
      />

      <Suspense fallback={<DecksContentFallback />}>
        <DecksContent decksPromise={decksPromise} />
      </Suspense>
    </>
  );
}

async function DecksContent({
  decksPromise
}: {
  decksPromise: ReturnType<typeof getDeckIndexSummaries>;
}) {
  const decks = await decksPromise;
  const deckCardData = decks.map((deck) => {
    return {
      deck,
      gamesPlayed: 0,
      deckListCount: deck.deckListCount,
      losses: 0,
      winRate: null
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
