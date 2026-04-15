import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import type { DeckSummary } from "@/types/index";

type DeckCardProps = {
  deck: DeckSummary;
  deckListCount: number;
  gamesPlayed: number;
  recordLabel: string;
  winRate: number | null;
  winRateLabel: string;
};

function formatUpdatedDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(date));
}

export function DeckCard({
  deck,
  deckListCount,
  gamesPlayed,
  recordLabel,
  winRate,
  winRateLabel
}: DeckCardProps) {
  const statusToneClassName =
    winRate == null
      ? "border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-muted)]"
      : winRate > 60
        ? "border-[var(--color-win-border)] bg-[var(--color-win-bg)] text-[var(--color-win-strong)]"
        : winRate >= 40
          ? "border-[rgba(217,119,6,0.22)] bg-[rgba(217,119,6,0.1)] text-[rgb(180,83,9)] dark:border-[rgba(251,191,36,0.22)] dark:bg-[rgba(245,158,11,0.12)] dark:text-[rgb(251,191,36)]"
          : "border-[var(--color-loss-border)] bg-[var(--color-loss-bg)] text-[var(--color-loss-strong)]";

  return (
    <Link className="block h-full" href={`/decks/${deck.id}`}>
      <Card className="flex h-full flex-col gap-5 transition hover:-translate-y-0.5 hover:border-[var(--color-brand)] hover:shadow-[var(--shadow-sm)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-3">
            <SpriteStrip className="min-h-12" pokemonOptions={null} size="lg" sprites={deck.deckPokemon} />
            <div className="space-y-2">
              <h2 className="font-display text-[1.22rem] font-semibold leading-tight tracking-[-0.035em] text-[var(--text-primary)]">
                {deck.deckName}
              </h2>
              <p className="text-sm leading-6 text-[var(--text-muted)]">
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

        <div className="grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-4">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3">
            <p className="ui-eyebrow">Record</p>
            <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">
              {gamesPlayed > 0 ? recordLabel : "No logs yet"}
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-3">
            <p className="ui-eyebrow">Deck lists</p>
            <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">{deckListCount}</p>
          </div>
        </div>

        <div className="mt-auto flex items-end justify-between gap-3 border-t border-[var(--border)] pt-4">
          <div className="space-y-1">
            <p className="ui-eyebrow">Last updated</p>
            <p className="text-sm text-[var(--text-muted)]">{formatUpdatedDate(deck.updatedAt)}</p>
          </div>
          <span className="ui-control-text text-[var(--color-brand)]">Open Deck</span>
        </div>
      </Card>
    </Link>
  );
}
