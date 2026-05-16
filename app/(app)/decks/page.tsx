import { Suspense } from "react";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Card } from "@/components/shadcn/card";
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
    <Suspense fallback={<DecksContentFallback />}>
      <DecksContent decksPromise={decksPromise} />
    </Suspense>
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
  const totalMatches = decks.reduce((matches, deck) => matches + deck.gamesPlayed, 0);

  const header = (
    <PageHeader
      action={
        <div className="hidden sm:block">
          <LazyDeckEditorButton triggerLabel="+ New deck" />
        </div>
      }
      breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Deck Strategy" }]}
      meta={
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-muted-foreground">
          <span>{decks.length} decks</span>
          <span aria-hidden="true">·</span>
          <span>{totalMatches} matches tracked</span>
        </div>
      }
      showDivider={false}
      title="Deck Strategy"
    />
  );

  if (decks.length === 0) {
    return (
      <>
        {header}
        <div className="sm:hidden">
          <LazyDeckEditorButton triggerLabel="+ New deck" />
        </div>
        <Card>
          <p className="text-sm text-foreground">No decks saved yet.</p>
        </Card>
      </>
    );
  }

  return (
    <>
      {header}
      <DeckStrategyCollection decks={deckCardData} />
    </>
  );
}

function DecksContentFallback() {
  return (
    <>
      <header className="flex flex-col gap-4">
        <Skeleton className="h-4 w-40" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-[22rem] max-w-full" />
          </div>
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
      </header>
      <div className="grid gap-5">
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <Skeleton className="h-10 w-32 rounded-lg sm:hidden" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton className="h-36 rounded-lg border border-border" key={index} />
          ))}
        </div>
      </div>
    </>
  );
}
