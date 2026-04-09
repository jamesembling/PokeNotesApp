"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import type { DeckSummary } from "@/types/index";

type DeckCardProps = {
  deck: DeckSummary;
  deckListCount: number;
  winRateLabel: string;
};

function formatUpdatedDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(date));
}

export function DeckCard({ deck, deckListCount, winRateLabel }: DeckCardProps) {
  return (
    <Link className="block h-full" href={`/decks/${deck.id}`}>
      <Card className="flex h-full flex-col gap-4 transition hover:translate-y-[-1px] hover:border-[var(--color-brand)]">
        <div className="flex flex-col items-center gap-3 text-center">
          <SpriteStrip size="lg" sprites={deck.deckPokemon} />
          <h2 className="font-display text-[1.18rem] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
            {deck.deckName}
          </h2>
        </div>

        <div className="grid gap-3 border-t border-[var(--border)] pt-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div className="space-y-1 min-w-0">
              <p className="ui-eyebrow">Win rate</p>
              <p className="text-sm font-medium text-[var(--text-primary)]">{winRateLabel}</p>
            </div>
            <div className="space-y-1 min-w-0">
              <p className="ui-eyebrow">Deck lists</p>
              <p className="text-sm font-medium text-[var(--text-primary)]">{deckListCount}</p>
            </div>
          </div>
          <div className="space-y-1">
            <p className="ui-eyebrow">Last updated</p>
            <p className="text-sm text-[var(--text-muted)]">{formatUpdatedDate(deck.updatedAt)}</p>
          </div>
        </div>

        <div className="mt-auto border-t border-[var(--border)] pt-4">
          <span className="ui-control-text text-[var(--color-brand)]">Open Deck</span>
        </div>
      </Card>
    </Link>
  );
}
