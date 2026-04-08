"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import type { DeckSummary } from "@/types/index";

type DeckCardProps = {
  deck: DeckSummary;
};

function formatUpdatedDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(date));
}

export function DeckCard({ deck }: DeckCardProps) {
  const strategySignals = [
    deck.goPreference ? `Prefers ${deck.goPreference}` : "Flexible opener",
    `${deck.deckPokemon.length} featured Pokemon`
  ];

  return (
    <Link className="block h-full" href={`/decks/${deck.id}`}>
      <Card className="flex h-full flex-col gap-5 transition hover:translate-y-[-1px] hover:border-[var(--color-brand)]">
        <div className="flex items-start justify-between gap-4">
          <SpriteStrip size="sm" sprites={deck.deckPokemon} />
          <div className="shrink-0">
            <Badge>{deck.format}</Badge>
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="font-display text-[1.18rem] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
            {deck.deckName}
          </h2>
          <p className="text-sm leading-6 text-[var(--text-muted)]">
            {strategySignals[0]}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-[18px] border border-[var(--border)] bg-[var(--bg-surface-alt)] p-3">
          <div className="space-y-1">
            <p className="ui-eyebrow">Approach</p>
            <p className="text-sm font-medium text-[var(--text-primary)]">{strategySignals[0]}</p>
          </div>
          <div className="space-y-1">
            <p className="ui-eyebrow">Profile</p>
            <p className="text-sm font-medium text-[var(--text-primary)]">{strategySignals[1]}</p>
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
          <div className="space-y-1">
            <p className="ui-eyebrow">Updated</p>
            <p className="text-sm text-[var(--text-muted)]">{formatUpdatedDate(deck.updatedAt)}</p>
          </div>
          <span className="ui-control-text text-[var(--color-brand)]">Open Deck</span>
        </div>
      </Card>
    </Link>
  );
}
