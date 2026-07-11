import Link from "next/link";
import { Card } from "@/components/shadcn/card";
import { CalendarIcon, ClockIcon } from "@/components/ui/icons";
import { deckCardRolloverClassName } from "@/components/ui/rolloverStyles";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { ItemTitle } from "@/components/ui/Typography";
import { formatAppCalendarDate } from "@/lib/date-time";
import type { DeckSummary } from "@/types/index";

export type DeckCardView = "tile" | "list";
type DeckCardDeck = Pick<DeckSummary, "id" | "deckName" | "deckPokemon" | "updatedAt">;

const listSpriteLaneClassName = "min-h-12 w-[82px] shrink-0 sm:w-[98px]";
type DeckCardProps = {
  deck: DeckCardDeck;
  deckListCount: number;
  gamesPlayed: number;
  recordLabel: string;
  view?: DeckCardView;
  winRate: number | null;
};

function getListWinRateTextClass(winRate: number | null) {
  if (winRate == null) {
    return "text-muted-foreground";
  }

  if (winRate > 60) {
    return "text-win-strong";
  }

  if (winRate >= 40) {
    return "text-warning-strong";
  }

  return "text-loss-strong";
}

export function DeckCard({
  deck,
  deckListCount,
  gamesPlayed,
  recordLabel,
  view = "tile",
  winRate
}: DeckCardProps) {
  const statusToneClassName =
    winRate == null
      ? "border-border bg-card text-muted-foreground"
      : winRate > 60
        ? "border-win-border bg-win-bg text-win-strong"
        : winRate >= 40
        ? "border-warning-border bg-warning-bg text-warning-strong"
        : "border-loss-border bg-loss-bg text-loss-strong";

  if (view === "list") {
    return (
      <Link
        className={`group block p-4 sm:px-6 ${deckCardRolloverClassName}`}
        href={`/decks/${deck.id}`}
        prefetch={false}
      >
        <div className="md:hidden">
          <div className="flex min-w-0 items-center gap-4">
            <SpriteStrip
              className={listSpriteLaneClassName}
              pokemonOptions={null}
              size="lg"
              sprites={deck.deckPokemon}
            />
            <ItemTitle as="h2" className="truncate" size="sm">
              {deck.deckName}
            </ItemTitle>
          </div>
        </div>

        <div className="hidden md:grid md:grid-cols-[minmax(0,1.7fr)_minmax(6.5rem,0.55fr)_minmax(7rem,0.65fr)_minmax(4.5rem,0.4fr)_minmax(7.5rem,0.6fr)_auto] md:items-center md:gap-4 lg:grid-cols-[minmax(0,1.95fr)_minmax(7rem,0.55fr)_minmax(7.5rem,0.7fr)_minmax(5rem,0.4fr)_minmax(8rem,0.65fr)_auto]">
          <div className="flex min-w-0 items-center gap-4">
            <SpriteStrip
              className={listSpriteLaneClassName}
              pokemonOptions={null}
              size="lg"
              sprites={deck.deckPokemon}
            />
            <div className="min-w-0 space-y-1">
              <ItemTitle as="h2" className="truncate">
                {deck.deckName}
              </ItemTitle>
              <p className="text-sm text-muted-foreground">
                {gamesPlayed > 0 ? `${gamesPlayed} logged matches` : "No linked battle logs"}
              </p>
            </div>
          </div>

          <div
            className={[
              "text-right font-display text-[1.05rem] font-semibold tracking-[-0.04em]",
              getListWinRateTextClass(winRate)
            ].join(" ")}
          >
            {winRate == null ? "--" : `${winRate}%`}
          </div>

          <div className="text-right text-sm font-medium text-card-foreground">
            {gamesPlayed > 0 ? recordLabel : "No logs yet"}
          </div>

          <div className="text-right text-sm font-medium text-card-foreground">{deckListCount}</div>

          <div className="text-right text-sm text-muted-foreground">
            {formatAppCalendarDate(deck.updatedAt)}
          </div>

          <span className="ui-control-text justify-self-end text-primary">Open</span>
        </div>
      </Link>
    );
  }

  return (
    <Link className="block h-full" href={`/decks/${deck.id}`} prefetch={false}>
      <Card className={`flex h-full flex-col gap-3 rounded-lg p-5 sm:p-5 ${deckCardRolloverClassName}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <SpriteStrip className="min-h-10" pokemonOptions={null} size="md" sprites={deck.deckPokemon} />
          </div>

          <div
            className={[
              "shrink-0 rounded-lg border px-3 py-1.5 text-center",
              statusToneClassName
            ].join(" ")}
          >
            <p className="text-[0.68rem] font-semibold uppercase leading-none text-current/80">Win rate</p>
            <p className="mt-1 font-display text-[1.05rem] font-semibold leading-none tracking-[-0.02em] text-current">
              {winRate == null ? "--" : `${winRate}%`}
            </p>
          </div>
        </div>

        <div className="min-w-0">
          <ItemTitle as="h2" className="truncate" size="sm">
            {deck.deckName}
          </ItemTitle>
          <p className="mt-0.5 text-sm font-medium leading-5 text-muted-foreground">
            {gamesPlayed > 0
              ? `Record ${recordLabel} · ${gamesPlayed} matches`
              : "No linked battle logs"}
          </p>
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3 text-xs font-medium text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1.5">
            <ClockIcon className="size-3.5 shrink-0" />
            <span className="truncate">{formatAppCalendarDate(deck.updatedAt)}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <CalendarIcon className="size-3.5" />
            <span>
              {deckListCount} {deckListCount === 1 ? "decklist" : "decklists"}
            </span>
          </span>
        </div>
      </Card>
    </Link>
  );
}
