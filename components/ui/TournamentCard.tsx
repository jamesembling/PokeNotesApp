"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { getTournamentRecord, formatTournamentDateRange } from "@/lib/tournaments/display";
import { getTournamentCategoryLabel, getTournamentPlacementLabel } from "@/lib/tournaments/options";
import type { TournamentSummary } from "@/types/index";

type TournamentCardProps = {
  formatLabel?: string;
  tournament: TournamentSummary;
};

export function TournamentCard({ tournament, formatLabel }: TournamentCardProps) {
  const record = getTournamentRecord(tournament.rounds);

  return (
    <Link className="block h-full" href={`/tournaments/${tournament.id}`}>
      <Card className="flex h-full flex-col gap-4 transition hover:translate-y-[-1px] hover:border-[var(--color-brand)]">
        <div className="flex items-start justify-between gap-4">
          <SpriteStrip size="lg" sprites={tournament.deckSprites} />
          <div className="shrink-0">
            <Badge>{record}</Badge>
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="font-display text-[1.18rem] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
            {tournament.name}
          </h2>
          <p className="text-sm leading-6 text-[var(--text-muted)]">
            {formatTournamentDateRange(tournament.dateFrom, tournament.dateTo)}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[var(--border)] pt-4">
          <div className="space-y-1 min-w-0">
            <p className="ui-eyebrow">Deck</p>
            <p className="text-sm font-medium text-[var(--text-primary)]">
              {tournament.deckName || "Unlinked deck"}
            </p>
          </div>
          <div className="space-y-1 min-w-0">
            <p className="ui-eyebrow">Rounds</p>
            <p className="text-sm font-medium text-[var(--text-primary)]">
              {tournament.rounds.length}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {tournament.category ? <Badge>{getTournamentCategoryLabel(tournament.category)}</Badge> : null}
          {tournament.placement ? (
            <Badge>{getTournamentPlacementLabel(tournament.placement)}</Badge>
          ) : null}
          {formatLabel ? <Badge>{formatLabel}</Badge> : null}
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
          <div className="space-y-1">
            <p className="ui-eyebrow">Updated</p>
            <p className="text-sm text-[var(--text-muted)]">
              {new Intl.DateTimeFormat("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric"
              }).format(new Date(tournament.updatedAt))}
            </p>
          </div>
          <span className="ui-control-text text-[var(--color-brand)]">Open Tournament</span>
        </div>
      </Card>
    </Link>
  );
}
