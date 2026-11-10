"use client";

import { useMemo, useState } from "react";
import { DeckCard } from "@/components/ui/DeckCard";
import { ChevronIcon } from "@/components/ui/icons";
import { LazyDeckEditorButton } from "@/components/ui/LazyDeckEditorButton";
import { PageActions } from "@/components/ui/PageActions";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { DeckSummary } from "@/types/index";
import { Button } from "@/components/shadcn/button";
import { Tabs } from "@/components/shadcn/tabs";
import styles from "@/components/ui/deck-strategy/collection.module.css";

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
  align?: "center" | "left" | "right";
  direction?: SortDirection;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      className={[
        styles.sortButton,
        align === "center"
          ? styles.sortButtonCenter
          : align === "right"
            ? "justify-self-end text-right"
            : "justify-self-start text-left",
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
  return (
    <Tabs
      className={styles.collection}
      onValueChange={(value) => setViewMode(value as ViewMode)}
      value={viewMode}
    >
      <div className={styles.toolbar}>
        <SegmentedControl
          ariaLabel="Deck strategy view"
          appearance="line"
          options={[
            { value: "list", label: "List" },
            { value: "tile", label: "Tiles" }
          ]}
          size="sm"
        />
        <PageActions
          className="w-fit shrink-0 sm:hidden"
          mobile="stack"
        >
          <LazyDeckEditorButton triggerLabel="+ New Deck" />
        </PageActions>
      </div>

      {viewMode === "list" ? (
        <div className={styles.list}>
          <div className={`${styles.listHeader} ${styles.columns}`}>
            <SortHeaderButton
              active={sort?.key === "deck"}
              direction={sort?.key === "deck" ? sort.direction : undefined}
              label="Deck"
              onClick={() => setSort({ key: "deck", direction: getNextSortDirection("deck", sort) })}
            />
            <SortHeaderButton
              active={sort?.key === "winRate"}
              align="center"
              direction={sort?.key === "winRate" ? sort.direction : undefined}
              label="Win rate"
              onClick={() =>
                setSort({ key: "winRate", direction: getNextSortDirection("winRate", sort) })
              }
            />
            <SortHeaderButton
              active={sort?.key === "record"}
              align="center"
              direction={sort?.key === "record" ? sort.direction : undefined}
              label="Record"
              onClick={() =>
                setSort({ key: "record", direction: getNextSortDirection("record", sort) })
              }
            />
            <SortHeaderButton
              active={sort?.key === "lists"}
              align="center"
              direction={sort?.key === "lists" ? sort.direction : undefined}
              label="Deck lists"
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
            <span aria-hidden="true" />
          </div>
          <div>
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
      ) : (
        <div className={styles.tiles}>
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
