import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/shadcn/button";
import { ButtonGroup } from "@/components/shadcn/button-group";
import { Card } from "@/components/shadcn/card";
import { DeckListEditorDialog } from "@/components/ui/DeckListEditorDialog";
import { DeckMatchupsDialog } from "@/components/ui/DeckMatchupsDialog";
import {
  DeckLogStatsGrid,
  DeckLogStatsGridFallback,
  DeckRelatedLogsSection,
  DeckRelatedLogsSectionFallback
} from "@/components/ui/DeckRelatedLogsSection";
import { ChevronIcon } from "@/components/ui/icons";
import { InlineDeckStrategyEditor } from "@/components/ui/InlineDeckStrategyEditor";
import { LazyDeckEditorButton } from "@/components/ui/LazyDeckEditorButton";
import { LazyDeckMatchupEditorButton } from "@/components/ui/LazyDeckMatchupEditorButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageWidth } from "@/components/ui/PageWidth";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { requireUser } from "@/lib/auth";
import { getDeckById, getDeckLogStats } from "@/lib/db/decks";
import { getLatestLogsForDeck } from "@/lib/db/logs";
import { measureServerCall } from "@/lib/server/perf";
import type { DeckMatchup } from "@/types/index";

type DeckDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(date));
}

function DeckMatchupTile({
  deckId,
  matchup
}: {
  deckId: string;
  matchup: DeckMatchup;
}) {
  return (
    <Link className="group block h-full" href={`/decks/${deckId}/matchups/${matchup.id}`} prefetch={false}>
      <Card className="flex h-full flex-col gap-4 transition hover:-translate-y-0.5 hover:border-primary hover:shadow-[var(--shadow-sm)]">
        <div className="flex items-start justify-between gap-3">
          <SpriteStrip className="min-h-10 shrink-0" size="md" sprites={matchup.deckPokemon} />
          <span className="inline-flex min-h-10 shrink-0 items-center rounded-2xl border border-primary bg-[color-mix(in_oklab,var(--color-brand)_8%,var(--bg-surface))] px-3 py-2 text-[0.76rem] font-semibold tracking-[0.12em] text-primary">
            OPEN
            <ChevronIcon className="h-4 w-4 -rotate-90" />
          </span>
        </div>

        <h3 className="truncate font-display text-[1.08rem] font-semibold leading-tight tracking-[-0.03em] text-card-foreground">
          {matchup.deckName}
        </h3>
      </Card>
    </Link>
  );
}

export default async function DeckDetailPage({ params }: DeckDetailPageProps) {
  const user = await requireUser();
  const { id } = await params;
  const deck = await getDeckById(user.id, id);
  const defaultCreatedBy =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "Trainer";

  if (!deck) {
    return (
      <PageWidth size="standard">
        <PageHeader
          breadcrumb={[
            { label: "Poke Notes", href: "/" },
            { label: "Deck Strategy", href: "/decks" },
            { label: "Not Found" }
          ]}
          title="Deck not found"
          subtitle="This deck could not be found or you do not have access to it."
        />

        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-foreground">
              The requested deck strategy is unavailable.
            </p>
            <Link
              className="text-sm font-medium text-primary transition hover:text-primary/90"
              href="/decks"
              prefetch={false}
            >
              Back to Decks
            </Link>
          </div>
        </Card>
      </PageWidth>
    );
  }

  const [deckStatsPromise, latestLogsPromise] = [
    getDeckLogStats(user.id, deck.id),
    getLatestLogsForDeck(user.id, deck.id, 5)
  ];
  const previewMatchups = deck.matchups.slice(0, 4);
  const deckActions = (
    <ButtonGroup className="max-w-full flex-wrap">
      <LazyDeckEditorButton
        deck={deck}
        triggerLabel="Edit Deck"
        triggerVariant="outline"
      />
      <Button asChild variant="outline">
        <Link href="/decks" prefetch={false}>
          Back to Decks
        </Link>
      </Button>
    </ButtonGroup>
  );

  return await measureServerCall("page.decks.detail.initialData", async () => (
    <PageWidth size="standard">
      <PageHeader
        breadcrumb={[
          { label: "Poke Notes", href: "/" },
          { label: "Deck Strategy", href: "/decks" },
          { label: deck.deckName }
        ]}
        title=""
      />

      <Card>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
              <SpriteStrip maxVisible={3} size="xl" sprites={deck.deckPokemon} />
              <h1 className="text-[2rem] font-semibold leading-tight tracking-[-0.02em] text-card-foreground sm:text-4xl">
                {deck.deckName}
              </h1>
            </div>

            <div className="lg:shrink-0">{deckActions}</div>
          </div>

          <Suspense fallback={<DeckLogStatsGridFallback />}>
            <DeckLogStatsGrid statsPromise={deckStatsPromise} />
          </Suspense>
        </div>
      </Card>
      <InlineDeckStrategyEditor deck={deck} />

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="ui-eyebrow">Matchup Notes</p>
          <ButtonGroup className="max-w-full flex-wrap">
            <DeckMatchupsDialog deckId={deck.id} matchups={deck.matchups} />
            <LazyDeckMatchupEditorButton
              deckId={deck.id}
              triggerLabel="New Matchup"
              triggerVariant="outline"
            />
          </ButtonGroup>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {previewMatchups.map((matchup) => (
            <DeckMatchupTile deckId={deck.id} key={matchup.id} matchup={matchup} />
          ))}
        </div>
      </Card>

      <Card className="space-y-4" id="deck-lists">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="ui-eyebrow">Deck Lists</p>
          <DeckListEditorDialog
            deckId={deck.id}
            defaultCreatedBy={defaultCreatedBy}
            defaultFormat={deck.format}
            triggerLabel="Add Deck List"
            triggerVariant="outline"
          />
        </div>

        {deck.deckLists.length === 0 ? (
          <p className="text-sm text-foreground">No deck lists saved.</p>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {deck.deckLists.map((deckList) => (
              <div
                className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                key={deckList.id}
              >
                <div className="space-y-1">
                  <p className="font-display text-[1.08rem] font-semibold tracking-[-0.025em] text-card-foreground">
                    {deckList.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {deckList.format}
                    {deckList.date ? ` · ${formatDate(deckList.date)}` : ""}
                  </p>
                </div>

                <ButtonGroup className="max-w-full flex-wrap">
                  <DeckListEditorDialog
                    deckId={deck.id}
                    deckList={deckList}
                    defaultCreatedBy={defaultCreatedBy}
                    defaultFormat={deck.format}
                    triggerLabel="Edit List"
                    triggerVariant="ghost"
                  />
                  <Button asChild variant="ghost">
                    <Link href={`/decks/${deck.id}/lists/${deckList.id}`} prefetch={false}>
                      View List
                    </Link>
                  </Button>
                </ButtonGroup>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Suspense fallback={<DeckRelatedLogsSectionFallback />}>
        <DeckRelatedLogsSection deck={deck} latestLogsPromise={latestLogsPromise} />
      </Suspense>
    </PageWidth>
  ));
}
