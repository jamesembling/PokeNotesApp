"use client";

import { useEffect, useMemo, useState } from "react";
import { DeckCard, type DeckCardView } from "@/components/ui/DeckCard";
import { ChevronIcon, GridIcon, MenuIcon } from "@/components/ui/icons";
import { LazyDeckEditorButton } from "@/components/ui/LazyDeckEditorButton";
import type { DeckSummary } from "@/types/index";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { Tabs } from "@/components/shadcn/tabs";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

const STORAGE_KEY = "poke-notes.deck-strategy-view";

type SortKey = "deck" | "winRate" | "record" | "lists" | "updated";
type SortDirection = "asc" | "desc";
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
        "h-auto gap-1 p-0 text-[0.72rem] font-semibold uppercase tracking-[0.22em] transition hover:bg-transparent",
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
  const [view, setView] = useState<DeckCardView>(() => {
    if (typeof window === "undefined") {
      return "tile";
    }

    const storedView = window.localStorage.getItem(STORAGE_KEY);
    return storedView === "tile" || storedView === "list" ? storedView : "tile";
  });
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection } | null>(null);
  const orderedDecks = useMemo(() => {
    if (!sort) {
      return decks;
    }

    const directionMultiplier = sort.direction === "asc" ? 1 : -1;

    return decks.toSorted((left, right) => {
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

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, view);
  }, [view]);

  const viewSwitcher = (
    <Tabs onValueChange={(value) => setView(value as DeckCardView)} value={view}>
      <SegmentedControl
        ariaLabel="Deck view mode"
        options={[
          { value: "tile", label: "Tiles", icon: GridIcon },
          { value: "list", label: "Decklist view", icon: MenuIcon }
        ]}
        size="icon"
      />
    </Tabs>
  );

  return (
    <section className="grid gap-5">
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <div className="sm:hidden">
          <LazyDeckEditorButton triggerLabel="+ New deck" />
        </div>
        {viewSwitcher}
      </div>

      {view === "tile" ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {orderedDecks.map(({ deck, deckListCount, gamesPlayed, losses, winRate }) => (
            <DeckCard
              deck={deck}
              deckListCount={deckListCount}
              gamesPlayed={gamesPlayed}
              key={deck.id}
              recordLabel={gamesPlayed > 0 ? `${gamesPlayed - losses}-${losses}` : "No record"}
              view={view}
              winRate={winRate}
            />
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="hidden border-b border-border bg-muted px-6 py-3 md:grid md:grid-cols-[minmax(0,1.7fr)_minmax(6.5rem,0.55fr)_minmax(7rem,0.65fr)_minmax(4.5rem,0.4fr)_minmax(7.5rem,0.6fr)_auto] md:items-center md:gap-4 lg:grid-cols-[minmax(0,1.95fr)_minmax(7rem,0.55fr)_minmax(7.5rem,0.7fr)_minmax(5rem,0.4fr)_minmax(8rem,0.65fr)_auto]">
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
            <div className="ui-eyebrow text-right">Open</div>
          </div>

          <div className="divide-y divide-[var(--border)]">
            {orderedDecks.map(({ deck, deckListCount, gamesPlayed, losses, winRate }) => (
              <DeckCard
                deck={deck}
                deckListCount={deckListCount}
                gamesPlayed={gamesPlayed}
                key={deck.id}
                recordLabel={gamesPlayed > 0 ? `${gamesPlayed - losses}-${losses}` : "No record"}
                view={view}
                winRate={winRate}
              />
            ))}
          </div>
        </Card>
      )}
    </section>
  );
}
