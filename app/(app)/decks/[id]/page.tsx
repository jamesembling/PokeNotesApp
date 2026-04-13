import { Suspense } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { DeckCompetitiveDataSection } from "@/components/ui/DeckCompetitiveDataSection";
import { DeckListEditorDialog } from "@/components/ui/DeckListEditorDialog";
import {
  DeckLogStatsGrid,
  DeckLogStatsGridFallback,
  DeckRelatedLogsSection,
  DeckRelatedLogsSectionFallback
} from "@/components/ui/DeckRelatedLogsSection";
import { ChevronIcon } from "@/components/ui/icons";
import { LazyDeckEditorButton } from "@/components/ui/LazyDeckEditorButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageWidth } from "@/components/ui/PageWidth";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { requireUser } from "@/lib/auth";
import { getDeckById, getDecks } from "@/lib/db/decks";
import { getAllLogsForDeck } from "@/lib/db/logs";
import type { Deck } from "@/types/index";

type DeckDetailPageProps = {
  params: {
    id: string;
  };
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(date));
}

function StrategySection({
  kicker,
  children,
  variant = "light"
}: {
  kicker: string;
  children: React.ReactNode;
  variant?: "hero" | "light";
}) {
  if (variant === "hero") {
    return (
      <Card>
        <div className="space-y-4">
          <p className="ui-eyebrow">{kicker}</p>
          {children}
        </div>
      </Card>
    );
  }

  return (
    <section className="border-t border-[var(--border)] pt-6">
      <div className="space-y-3">
        <p className="ui-eyebrow">{kicker}</p>
        {children}
      </div>
    </section>
  );
}

function MatchupPlaceholderTile({
  deck,
  index
}: {
  deck: Deck;
  index: number;
}) {
  return (
    <button className="block h-full text-left" type="button">
      <Card className="flex h-full flex-col gap-5 transition hover:-translate-y-0.5 hover:border-[var(--color-brand)] hover:shadow-[var(--shadow-sm)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-3">
            <SpriteStrip className="min-h-12" size="lg" sprites={deck.deckPokemon} />
            <div className="space-y-2">
              <h3 className="font-display text-[1.12rem] font-semibold leading-tight tracking-[-0.03em] text-[var(--text-primary)]">
                Matchup {index}
              </h3>
              <p className="text-sm leading-6 text-[var(--text-muted)]">
                Placeholder tile for matchup notes and planning.
              </p>
            </div>
          </div>

          <div className="shrink-0 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-center text-[var(--text-muted)]">
            <p className="ui-eyebrow text-current/80">Status</p>
            <p className="mt-1 font-display text-[1rem] font-semibold tracking-[-0.03em] text-current">
              Soon
            </p>
          </div>
        </div>

        <div className="mt-auto flex items-end justify-between gap-3 border-t border-[var(--border)] pt-4">
          <div className="space-y-1">
            <p className="ui-eyebrow">Notes</p>
            <p className="text-sm text-[var(--text-muted)]">No matchup page linked yet.</p>
          </div>
          <span className="inline-flex items-center gap-1 ui-control-text text-[var(--color-brand)]">
            Open matchup
            <ChevronIcon className="h-4 w-4 -rotate-90" />
          </span>
        </div>
      </Card>
    </button>
  );
}

export default async function DeckDetailPage({ params }: DeckDetailPageProps) {
  const user = await requireUser();
  const [deck, userDecks] = await Promise.all([
    getDeckById(user.id, params.id),
    getDecks(user.id)
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

  const relatedLogsPromise = getAllLogsForDeck(user.id, deck.id, userDecks);
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

      <DeckCompetitiveDataSection deckPokemon={deck.deckPokemon} />

      {deck.generalNotes ? (
        <StrategySection kicker="GENERAL NOTES">
          <p className="whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
            {deck.generalNotes}
          </p>
        </StrategySection>
      ) : null}

      {deck.resourcePlan ? (
        <StrategySection kicker="RESOURCE PLAN">
          <p className="whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
            {deck.resourcePlan}
          </p>
        </StrategySection>
      ) : null}

      {deck.setupGoals.length > 0 ? (
        <StrategySection kicker="SETUP GOALS">
          <ul className="list-disc space-y-2 pl-5 text-sm text-[var(--text-secondary)]">
            {deck.setupGoals.map((goal, index) => (
              <li key={`${goal}-${index}`}>{goal}</li>
            ))}
          </ul>
        </StrategySection>
      ) : null}

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

      <Card className="space-y-4">
        <div className="space-y-1">
          <p className="ui-eyebrow">Core Strategy</p>
        </div>
        <div className="min-h-[240px] rounded-2xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-5 py-4">
          <p className="whitespace-pre-wrap text-sm leading-7 text-[var(--text-secondary)]">
            {deck.coreStrategy || "No core strategy added yet."}
          </p>
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="space-y-1">
          <p className="ui-eyebrow">Matchup Notes</p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((index) => (
            <MatchupPlaceholderTile deck={deck} index={index} key={index} />
          ))}
        </div>
      </Card>
    </PageWidth>
  );
}
