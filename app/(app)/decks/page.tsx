import { Suspense } from "react";
import { Card } from "@/components/shadcn/card";
import { DecksLoadingState } from "@/components/ui/DecksLoadingState";
import { DeckStrategyCollection } from "@/components/ui/DeckStrategyCollection";
import { LazyDeckEditorButton } from "@/components/ui/LazyDeckEditorButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageActions } from "@/components/ui/PageActions";
import {
  ProxyAuthTimingMarker,
  RouteTimingMarker
} from "@/components/ui/RouteTimingMarker";
import { requireUser } from "@/lib/auth";
import { getDeckIndexSummaries } from "@/lib/db/decks";
import { measureServerCallWithTiming, takeRouteEntryEpochMs } from "@/lib/server/perf";

export default async function DecksPage() {
  const routeEnteredAtEpochMs = takeRouteEntryEpochMs();
  const user = await requireUser();
  const decksPromise = measureServerCallWithTiming("page.decks.initialData", () =>
    getDeckIndexSummaries(user.id)
  );

  return (
    <>
      <ProxyAuthTimingMarker routeEnteredAtEpochMs={routeEnteredAtEpochMs} />
      <Suspense fallback={<DecksLoadingState />}>
        <DecksContent decksPromise={decksPromise} />
      </Suspense>
    </>
  );
}

async function DecksContent({
  decksPromise
}: {
  decksPromise: Promise<{
    durationMs: number;
    value: Awaited<ReturnType<typeof getDeckIndexSummaries>>;
  }>;
}) {
  const decksTiming = await decksPromise;
  const decks = decksTiming.value;
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
        <PageActions className="hidden sm:flex">
          <LazyDeckEditorButton triggerLabel="+ New deck" />
        </PageActions>
      }
      breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Deck Strategy" }]}
      meta={
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-muted-foreground">
          <span>{decks.length} decks</span>
          <span aria-hidden="true">·</span>
          <span>{totalMatches} matches tracked</span>
        </div>
      }
      title="Deck Strategy"
    />
  );

  if (decks.length === 0) {
    return (
      <>
        <RouteTimingMarker durationMs={decksTiming.durationMs} phase="route-data" />
        {header}
        <PageActions className="sm:hidden" mobile="stack">
          <LazyDeckEditorButton triggerLabel="+ New deck" />
        </PageActions>
        <Card>
          <p className="text-sm text-foreground">No decks saved yet.</p>
        </Card>
      </>
    );
  }

  return (
    <>
      <RouteTimingMarker durationMs={decksTiming.durationMs} phase="route-data" />
      {header}
      <DeckStrategyCollection decks={deckCardData} />
    </>
  );
}
