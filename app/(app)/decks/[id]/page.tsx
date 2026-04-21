import { Suspense } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
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
import { getDeckById } from "@/lib/db/decks";
import { getAllLogsForDeck } from "@/lib/db/logs";
import { getDeckLinkCandidates } from "@/lib/log-import/deck-linking";
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
    <Link className="group block h-full" href={`/decks/${deckId}/matchups/${matchup.id}`}>
      <Card className="flex h-full flex-col gap-4 transition hover:-translate-y-0.5 hover:border-[var(--color-brand)] hover:shadow-[var(--shadow-sm)]">
        <div className="flex items-start justify-between gap-3">
          <SpriteStrip className="min-h-10 shrink-0" size="md" sprites={matchup.deckPokemon} />
          <span className="inline-flex min-h-10 shrink-0 items-center rounded-2xl border border-[var(--color-brand)] bg-[color-mix(in_oklab,var(--color-brand)_8%,var(--bg-surface))] px-3 py-2 text-[0.76rem] font-semibold tracking-[0.12em] text-[var(--color-brand)]">
            OPEN
            <ChevronIcon className="h-4 w-4 -rotate-90" />
          </span>
        </div>

        <h3 className="truncate font-display text-[1.08rem] font-semibold leading-tight tracking-[-0.03em] text-[var(--text-primary)]">
          {matchup.deckName}
        </h3>
      </Card>
    </Link>
  );
}

export default async function DeckDetailPage({ params }: DeckDetailPageProps) {
  const user = await requireUser();
  const { id } = await params;
  const [deck, deckLinkCandidates] = await Promise.all([
    getDeckById(user.id, id),
    getDeckLinkCandidates(user.id)
  ]);
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
            <p className="text-sm text-[var(--text-secondary)]">
              The requested deck strategy is unavailable.
            </p>
            <Link
              className="text-sm font-medium text-[var(--color-brand)] transition hover:text-[var(--color-brand-hover)]"
              href="/decks"
            >
              Back to Decks
            </Link>
          </div>
        </Card>
      </PageWidth>
    );
  }

  const relatedLogsPromise = getAllLogsForDeck(user.id, deck.id, deckLinkCandidates);
  const previewMatchups = deck.matchups.slice(0, 4);
  const deckActions = (
    <div className="flex flex-wrap items-center gap-3">
      <LazyDeckEditorButton
        deck={deck}
        triggerLabel="Edit Deck"
        triggerVariant="secondary"
      />
      <Link
        className="text-sm font-medium text-[var(--color-brand)] transition hover:text-[var(--color-brand-hover)]"
        href="/decks"
      >
        Back to Decks
      </Link>
    </div>
  );

  return (
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
              <h1 className="text-[2rem] font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)] sm:text-4xl">
                {deck.deckName}
              </h1>
            </div>

            <div className="lg:shrink-0">{deckActions}</div>
          </div>

          <Suspense fallback={<DeckLogStatsGridFallback />}>
            <DeckLogStatsGrid logsPromise={relatedLogsPromise} />
          </Suspense>
        </div>
      </Card>
      <InlineDeckStrategyEditor deck={deck} />

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="ui-eyebrow">Matchup Notes</p>
          <div className="flex flex-wrap items-center gap-3">
            <DeckMatchupsDialog deckId={deck.id} matchups={deck.matchups} />
            <LazyDeckMatchupEditorButton
              deckId={deck.id}
              triggerLabel="New Matchup"
              triggerVariant="secondary"
            />
          </div>
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
            triggerVariant="secondary"
          />
        </div>

        {deck.deckLists.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No deck lists saved.</p>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {deck.deckLists.map((deckList) => (
              <div
                className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                key={deckList.id}
              >
                <div className="space-y-1">
                  <p className="font-display text-[1.08rem] font-semibold tracking-[-0.025em] text-[var(--text-primary)]">
                    {deckList.name}
                  </p>
                  <p className="text-sm text-[var(--text-muted)]">
                    {deckList.format}
                    {deckList.date ? ` · ${formatDate(deckList.date)}` : ""}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <DeckListEditorDialog
                    deckId={deck.id}
                    deckList={deckList}
                    defaultCreatedBy={defaultCreatedBy}
                    defaultFormat={deck.format}
                    triggerLabel="Edit List"
                    triggerVariant="ghost"
                  />
                  <Link
                    className="text-sm font-medium text-[var(--color-brand)] transition hover:text-[var(--color-brand-hover)]"
                    href={`/decks/${deck.id}/lists/${deckList.id}`}
                  >
                    View List
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Suspense fallback={<DeckRelatedLogsSectionFallback />}>
        <DeckRelatedLogsSection deck={deck} logsPromise={relatedLogsPromise} />
      </Suspense>
    </PageWidth>
  );
}
