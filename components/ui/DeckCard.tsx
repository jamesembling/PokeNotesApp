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
  return (
    <Link className="block h-full" href={`/decks/${deck.id}`}>
      <Card className="flex h-full flex-col gap-4 transition hover:translate-y-[-1px] hover:border-[var(--color-brand)]">
        <SpriteStrip size="sm" sprites={deck.deckPokemon} />

        <div className="space-y-3">
          <div className="flex flex-wrap items-start gap-2">
            <h2 className="font-display text-[1.1rem] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
              {deck.deckName}
            </h2>
            <Badge>{deck.format}</Badge>
          </div>

          {deck.goPreference ? (
            <p className="text-sm text-[var(--text-muted)]">
              Prefers {deck.goPreference}
            </p>
          ) : null}
        </div>

        <div className="mt-auto text-sm text-[var(--text-muted)]">
          Updated {formatUpdatedDate(deck.updatedAt)}
        </div>
      </Card>
    </Link>
  );
}
