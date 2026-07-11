"use client";

import { useMemo, useState } from "react";
import { DeckCard } from "@/components/ui/DeckCard";
import { ChevronIcon } from "@/components/ui/icons";
import { LazyDeckEditorButton } from "@/components/ui/LazyDeckEditorButton";
import { PageActions } from "@/components/ui/PageActions";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SectionHeader } from "@/components/ui/SectionHeader";
import type { DeckSummary } from "@/types/index";
import { Button } from "@/components/shadcn/button";
import { Tabs } from "@/components/shadcn/tabs";

type SortKey = "deck" | "winRate" | "record" | "lists" | "updated";
type SortDirection = "asc" | "desc";
type ViewMode = "list" | "tile";
type DeckStrategyDeck = Pick<DeckSummary, "id" | "deckName" | "deckPokemon" | "updatedAt">;

type DeckStrategyCollectionProps = {
  decks: Array<{
    deck: DeckStrategyDeck;
    deckListCount: number;
    gamesPlayed: number;
    losses: number;
    winRate: number | null;
  }>;
};

function getNextSortDirection(key: SortKey, currentSort: { key: SortKey; direction: SortDirection } | null) {
  if (currentSort?.key === key) {
    return currentSort.direction === "desc" ? "asc" : "desc";
  }

  return key === "deck" ? "asc" : "desc";
}

function SortHeaderButton({
  active,
  align = "left",
  direction,
  label,
  onClick
}: {
  active: boolean;
  align?: "left" | "right";
  direction?: SortDirection;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      className={[
        "h-auto gap-1 p-0 text-[0.72rem] font-semibold uppercase tracking-[0.12em] transition hover:bg-transparent",
        align === "right" ? "justify-self-end text-right" : "text-left",
        active
          ? "text-card-foreground"
          : "text-muted-foreground hover:text-card-foreground"
      ].join(" ")}
      onClick={onClick}
      type="button"
      variant="ghost"
    >
      <span>{label}</span>
      <ChevronIcon
        className={[
          "h-3.5 w-3.5 transition",
          active ? "opacity-100" : "opacity-45",
          active && direction === "asc" ? "rotate-180" : ""
        ].join(" ")}
      />
    </Button>
  );
}

export function DeckStrategyCollection({ decks }: DeckStrategyCollectionProps) {
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const orderedDecks = useMemo(() => {
    if (!sort) {
      return decks;
    }

    const directionMultiplier = sort.direction === "asc" ? 1 : -1;

    return [...decks].sort((left, right) => {
      switch (sort.key) {
        case "deck":
          return left.deck.deckName.localeCompare(right.deck.deckName) * directionMultiplier;
        case "winRate": {
          const leftValue = left.winRate ?? -1;
          const rightValue = right.winRate ?? -1;
          if (leftValue !== rightValue) {
            return (leftValue - rightValue) * directionMultiplier;
          }
          return left.deck.deckName.localeCompare(right.deck.deckName);
        }
        case "record": {
          const leftWins = left.gamesPlayed - left.losses;
          const rightWins = right.gamesPlayed - right.losses;
          if (leftWins !== rightWins) {
            return (leftWins - rightWins) * directionMultiplier;
          }
          if (left.losses !== right.losses) {
            return (right.losses - left.losses) * directionMultiplier;
          }
          if (left.gamesPlayed !== right.gamesPlayed) {
            return (left.gamesPlayed - right.gamesPlayed) * directionMultiplier;
          }
          return left.deck.deckName.localeCompare(right.deck.deckName);
        }
        case "lists":
          if (left.deckListCount !== right.deckListCount) {
            return (left.deckListCount - right.deckListCount) * directionMultiplier;
          }
          return left.deck.deckName.localeCompare(right.deck.deckName);
        case "updated": {
          const leftValue = new Date(left.deck.updatedAt).getTime();
          const rightValue = new Date(right.deck.updatedAt).getTime();
          if (leftValue !== rightValue) {
            return (leftValue - rightValue) * directionMultiplier;
          }
          return left.deck.deckName.localeCompare(right.deck.deckName);
        }
        default:
          return 0;
      }
    });
  }, [decks, sort]);
  const deckCountLabel = `${orderedDecks.length} ${orderedDecks.length === 1 ? "deck" : "decks"}`;

  return (
    <Tabs
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3"
      onValueChange={(value) => setViewMode(value as ViewMode)}
      value={viewMode}
    >
      <div className="deck-strategy-ledger-toolbar flex w-full min-w-0 flex-col items-stretch justify-between gap-3 rounded-lg border border-border px-3 py-2 min-[360px]:flex-row min-[360px]:items-center">
        <SegmentedControl
          ariaLabel="Deck strategy view"
          options={[
            { value: "list", label: "List" },
            { value: "tile", label: "Tiles" }
          ]}
          size="sm"
        />
        <PageActions
          className="w-auto self-stretch sm:hidden min-[360px]:w-fit min-[360px]:self-auto [&>button]:w-full min-[360px]:[&>button]:w-auto"
          mobile="stack"
        >
          <LazyDeckEditorButton triggerLabel="+ New deck" />
        </PageActions>
      </div>

      {viewMode === "list" ? (
        <section className="flex flex-col gap-4" aria-labelledby="deck-strategy-list-heading">
          <SectionHeader
            eyebrow={`${deckCountLabel} · Sortable list`}
            title="Deck library"
            titleId="deck-strategy-list-heading"
          />
          <div className="overflow-hidden rounded-lg border border-border bg-background">
            <div className="hidden border-b border-border bg-muted px-4 py-2.5 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground md:grid md:grid-cols-[minmax(0,1.7fr)_minmax(6.5rem,0.55fr)_minmax(7rem,0.65fr)_minmax(4.5rem,0.4fr)_minmax(7.5rem,0.6fr)_auto] md:items-center md:gap-4 lg:grid-cols-[minmax(0,1.95fr)_minmax(7rem,0.55fr)_minmax(7.5rem,0.7fr)_minmax(5rem,0.4fr)_minmax(8rem,0.65fr)_auto] lg:px-5">
              <SortHeaderButton
                active={sort?.key === "deck"}
                direction={sort?.key === "deck" ? sort.direction : undefined}
                label="Deck"
                onClick={() => setSort({ key: "deck", direction: getNextSortDirection("deck", sort) })}
              />
              <SortHeaderButton
                active={sort?.key === "winRate"}
                align="right"
                direction={sort?.key === "winRate" ? sort.direction : undefined}
                label="Win rate"
                onClick={() =>
                  setSort({ key: "winRate", direction: getNextSortDirection("winRate", sort) })
                }
              />
              <SortHeaderButton
                active={sort?.key === "record"}
                align="right"
                direction={sort?.key === "record" ? sort.direction : undefined}
                label="Record"
                onClick={() =>
                  setSort({ key: "record", direction: getNextSortDirection("record", sort) })
                }
              />
              <SortHeaderButton
                active={sort?.key === "lists"}
                align="right"
                direction={sort?.key === "lists" ? sort.direction : undefined}
                label="Decklists"
                onClick={() => setSort({ key: "lists", direction: getNextSortDirection("lists", sort) })}
              />
              <SortHeaderButton
                active={sort?.key === "updated"}
                align="right"
                direction={sort?.key === "updated" ? sort.direction : undefined}
                label="Updated"
                onClick={() =>
                  setSort({ key: "updated", direction: getNextSortDirection("updated", sort) })
                }
              />
              <div className="justify-self-end text-right">Open</div>
            </div>
            <div className="divide-y divide-border">
              {orderedDecks.map(({ deck, deckListCount, gamesPlayed, losses, winRate }) => (
                <DeckCard
                  deck={deck}
                  deckListCount={deckListCount}
                  gamesPlayed={gamesPlayed}
                  key={deck.id}
                  recordLabel={gamesPlayed > 0 ? `${gamesPlayed - losses}-${losses}` : "No record"}
                  view="list"
                  winRate={winRate}
                />
              ))}
            </div>
          </div>
        </section>
      ) : (
        <div className="deck-strategy-ledger-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
          {orderedDecks.map(({ deck, deckListCount, gamesPlayed, losses, winRate }) => (
            <DeckCard
              deck={deck}
              deckListCount={deckListCount}
              gamesPlayed={gamesPlayed}
              key={deck.id}
              recordLabel={gamesPlayed > 0 ? `${gamesPlayed - losses}-${losses}` : "No record"}
              view="tile"
              winRate={winRate}
            />
          ))}
        </div>
      )}
    </Tabs>
  );
}
