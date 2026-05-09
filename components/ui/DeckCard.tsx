import Link from "next/link";
import { Card } from "@/components/shadcn/card";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
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

function formatUpdatedDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(date));
}

function getListWinRateTextClass(winRate: number | null) {
  if (winRate == null) {
    return "text-muted-foreground";
  }

  if (winRate > 60) {
    return "text-[var(--color-win-strong)]";
  }

  if (winRate >= 40) {
    return "text-[rgb(180,83,9)] dark:text-[rgb(251,191,36)]";
  }

  return "text-[var(--color-loss-strong)]";
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
        ? "border-[var(--color-win-border)] bg-[var(--color-win-bg)] text-[var(--color-win-strong)]"
        : winRate >= 40
        ? "border-[rgba(217,119,6,0.22)] bg-[rgba(217,119,6,0.1)] text-[rgb(180,83,9)] dark:border-[rgba(251,191,36,0.22)] dark:bg-[rgba(245,158,11,0.12)] dark:text-[rgb(251,191,36)]"
        : "border-[var(--color-loss-border)] bg-[var(--color-loss-bg)] text-[var(--color-loss-strong)]";

  if (view === "list") {
    return (
      <Link
        className="group block px-4 py-4 transition hover:bg-muted sm:px-6"
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
            <h2 className="truncate font-display text-[1.02rem] font-semibold leading-tight tracking-[-0.03em] text-card-foreground transition group-hover:text-primary">
              {deck.deckName}
            </h2>
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
              <h2 className="truncate font-display text-[1.08rem] font-semibold leading-tight tracking-[-0.03em] text-card-foreground transition group-hover:text-primary">
                {deck.deckName}
              </h2>
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

          <div className="text-right text-sm text-muted-foreground">{formatUpdatedDate(deck.updatedAt)}</div>

          <span className="ui-control-text justify-self-end text-primary">Open</span>
        </div>
      </Link>
    );
  }

  return (
    <Link className="block h-full" href={`/decks/${deck.id}`} prefetch={false}>
      <Card className="flex h-full flex-col gap-5 transition hover:-translate-y-0.5 hover:border-primary hover:shadow-[var(--shadow-sm)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-3">
            <SpriteStrip className="min-h-12" pokemonOptions={null} size="lg" sprites={deck.deckPokemon} />
            <div className="space-y-2">
              <h2 className="font-display text-[1.22rem] font-semibold leading-tight tracking-[-0.035em] text-card-foreground">
                {deck.deckName}
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                {gamesPlayed > 0
                  ? `${recordLabel} across ${gamesPlayed} logged matches`
                  : "No battle logs linked yet"}
              </p>
            </div>
          </div>

          <div
            className={[
              "shrink-0 rounded-2xl border px-3 py-2 text-center",
              statusToneClassName
            ].join(" ")}
          >
            <p className="ui-eyebrow text-current/80">Win rate</p>
            <p className="mt-1 font-display text-[1.3rem] font-semibold tracking-[-0.04em] text-current">
              {winRate == null ? "--" : `${winRate}%`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
          <div className="rounded-2xl border border-border bg-muted px-4 py-3">
            <p className="ui-eyebrow">Record</p>
            <p className="mt-1 text-sm font-medium text-card-foreground">
              {gamesPlayed > 0 ? recordLabel : "No logs yet"}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-muted px-4 py-3">
            <p className="ui-eyebrow">Deck lists</p>
            <p className="mt-1 text-sm font-medium text-card-foreground">{deckListCount}</p>
          </div>
        </div>

        <div className="mt-auto flex items-end justify-between gap-3 border-t border-border pt-4">
          <div className="space-y-1">
            <p className="ui-eyebrow">Last updated</p>
            <p className="text-sm text-muted-foreground">{formatUpdatedDate(deck.updatedAt)}</p>
          </div>
          <span className="ui-control-text text-primary">Open Deck</span>
        </div>
      </Card>
    </Link>
  );
}
