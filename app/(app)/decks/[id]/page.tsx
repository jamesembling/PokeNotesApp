import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { DeckMatchupsDialog } from "@/components/ui/DeckMatchupsDialog";
import { DeckStrategyWorkspace } from "@/components/ui/DeckStrategyWorkspace";
import { DeckStrategyMobileMenu } from "@/components/ui/DeckStrategyMobileMenu";
import { DeckStrategyResourcesMenu } from "@/components/ui/DeckStrategyResourcesMenu";
import { LazyDeckEditorButton } from "@/components/ui/LazyDeckEditorButton";
import { LazyDeckMatchupEditorButton } from "@/components/ui/LazyDeckMatchupEditorButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageActions } from "@/components/ui/PageActions";
import { PageWidth } from "@/components/ui/PageWidth";
import { deckCardRolloverClassName } from "@/components/ui/rolloverStyles";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { DetailTitle, ItemTitle } from "@/components/ui/Typography";
import { requireUser } from "@/lib/auth";
import { getDeckById, getDeckLogStats } from "@/lib/db/decks";
import { measureServerCall } from "@/lib/server/perf";
import type { Deck, DeckList, DeckMatchup } from "@/types/index";

type DeckDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

function DeckMatchupTile({
  deckId,
  matchup
}: {
  deckId: string;
  matchup: DeckMatchup;
}) {
  return (
    <Link className="group block h-full" href={`/decks/${deckId}/matchups/${matchup.id}`} prefetch={false}>
      <Card className={`h-full gap-0 p-0 sm:gap-0 sm:p-0 ${deckCardRolloverClassName}`}>
        <div className="flex min-h-16 items-center gap-3 px-4 py-3">
          <SpriteStrip className="min-h-10 shrink-0" size="md" sprites={matchup.deckPokemon} />
          <ItemTitle className="min-w-0 flex-1 truncate">{matchup.deckName}</ItemTitle>
          <ChevronRight
            aria-hidden="true"
            className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          />
        </div>
      </Card>
    </Link>
  );
}

function getDeckEditorPayload(deck: Deck) {
  const { deckLists: _deckLists, matchups: _matchups, ...editorDeck } = deck;
  return editorDeck;
}

function getDeckListRowPayload(deckList: DeckList) {
  return {
    date: deckList.date,
    format: deckList.format,
    id: deckList.id,
    name: deckList.name
  };
}

export default async function DeckDetailPage({ params }: DeckDetailPageProps) {
  const [user, { id }] = await Promise.all([requireUser(), params]);
  const deckPromise = getDeckById(user.id, id);
  const deckStatsPromise = getDeckLogStats(user.id, id);
  const [deck, stats] = await Promise.all([deckPromise, deckStatsPromise]);

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

  const deckEditorPayload = getDeckEditorPayload(deck);
  const previewMatchups = deck.matchups.slice(0, 4);
  const deckListRows = deck.deckLists.map(getDeckListRowPayload);
  const defaultCreatedBy =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "Trainer";
  const deckActions = (
    <PageActions>
      <LazyDeckEditorButton
        deck={deckEditorPayload}
        triggerLabel="Edit Deck"
        triggerVariant="outline"
      />
      <DeckStrategyResourcesMenu
        deckId={deck.id}
        deckLists={deckListRows}
        defaultCreatedBy={defaultCreatedBy}
        defaultFormat={deck.format}
      />
      <Button asChild variant="outline">
        <Link href="/decks" prefetch={false}>
          <ArrowLeft className="size-4" />
          Back to Decks
        </Link>
      </Button>
    </PageActions>
  );

  return await measureServerCall("page.decks.detail.initialData", async () => (
    <PageWidth size="wide">
      <div className="hidden sm:block">
        <PageHeader
          breadcrumb={[
            { label: "Poke Notes", href: "/" },
            { label: "Deck Strategy", href: "/decks" },
            { label: deck.deckName }
          ]}
        />
      </div>

      <section className="flex items-center gap-3 border-b border-border pb-5 sm:gap-5 sm:border-b-0 sm:pb-0">
        <Button asChild className="sm:hidden" size="icon-lg" variant="ghost">
          <Link aria-label="Back to deck strategies" href="/decks" prefetch={false}>
            <ArrowLeft className="size-6" />
          </Link>
        </Button>
        <SpriteStrip
          className="min-h-10 shrink-0 sm:hidden"
          maxVisible={3}
          size="md"
          sprites={deck.deckPokemon}
        />
        <SpriteStrip
          className="hidden min-h-14 shrink-0 sm:flex"
          maxVisible={3}
          size="xl"
          sprites={deck.deckPokemon}
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-3">
            <DetailTitle className="truncate" size="sm">{deck.deckName}</DetailTitle>
            {stats.total > 0 ? (
              <span className="shrink-0 rounded-full border border-win-border bg-win-bg px-3 py-1 text-sm font-semibold tabular-nums text-win-strong">
                {stats.wins}–{stats.losses}
              </span>
            ) : null}
          </div>
        </div>

        <div className="hidden shrink-0 sm:block">{deckActions}</div>
        <div className="sm:hidden">
          <DeckStrategyMobileMenu
            deck={deckEditorPayload}
            deckLists={deckListRows}
            defaultCreatedBy={defaultCreatedBy}
            defaultFormat={deck.format}
          />
        </div>
      </section>

      <DeckStrategyWorkspace deck={deck} />

      <section
        aria-labelledby="deck-matchups-heading"
        className="space-y-4 border-y border-border py-6"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2
            className="font-display text-2xl font-semibold tracking-[-0.03em] text-card-foreground"
            id="deck-matchups-heading"
          >
            Matchup Notes
          </h2>
          <div className="shrink-0">
            <PageActions>
              <DeckMatchupsDialog deckId={deck.id} matchups={deck.matchups} />
              <LazyDeckMatchupEditorButton
                deckId={deck.id}
                triggerLabel="New Matchup"
                triggerVariant="outline"
              />
            </PageActions>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {previewMatchups.map((matchup) => (
            <DeckMatchupTile deckId={deck.id} key={matchup.id} matchup={matchup} />
          ))}
        </div>
      </section>
    </PageWidth>
  ));
}
