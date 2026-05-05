import { Suspense } from "react";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Card } from "@/components/ui/Card";
import { DeckStrategyCollection } from "@/components/ui/DeckStrategyCollection";
import { LazyDeckEditorButton } from "@/components/ui/LazyDeckEditorButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireUser } from "@/lib/auth";
import { getDeckIndexSummaries } from "@/lib/db/decks";
import { measureServerCall } from "@/lib/server/perf";

export default async function DecksPage() {
  const user = await requireUser();
  const decksPromise = measureServerCall("page.decks.initialData", () =>
    getDeckIndexSummaries(user.id)
  );

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
      gamesPlayed: deck.gamesPlayed,
      deckListCount: deck.deckListCount,
      losses: deck.losses,
      winRate: deck.winRate
    };
  });

  if (decks.length === 0) {
    return (
      <Card>
        <p className="text-sm text-foreground">No decks saved yet.</p>
      </Card>
    );
  }

  return <DeckStrategyCollection decks={deckCardData} />;
}

function DecksContentFallback() {
  return (
    <Card className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-5 w-44" />
        </div>
        <Skeleton className="h-10 w-36 rounded-xl" />
      </div>
      <div className="grid gap-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton className="h-28 rounded-xl border border-border" key={index} />
        ))}
      </div>
    </Card>
  );
}
