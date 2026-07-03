"use client";

import Link from "next/link";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { formatDayDate } from "@/lib/client/date-format";
import { getTournamentRecord } from "@/lib/tournaments/display";
import { getTournamentCategoryLabel, getTournamentPlacementLabel } from "@/lib/tournaments/options";
import { getTournamentPlacementPillClassName } from "@/lib/tournaments/placement-pill";
import type { TournamentSummary } from "@/types/index";

function TournamentSummaryRow({
  tournament
}: {
  tournament: TournamentSummary;
}) {
  const placementLabel = tournament.placement
    ? getTournamentPlacementLabel(tournament.placement)
    : "No placement";
  const summarySubheading = [
    formatDayDate(tournament.dateFrom),
    tournament.category ? getTournamentCategoryLabel(tournament.category) : ""
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="group/row space-y-2">
      <div
        className="group/card relative grid w-full grid-cols-1 gap-x-3 gap-y-3 overflow-hidden rounded-[10px] border border-border bg-muted p-4 text-left transition duration-200 hover:brightness-[0.98] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background sm:grid-cols-[4rem_minmax(0,1fr)_7.5rem_minmax(5.5rem,auto)] sm:items-center sm:gap-4 lg:px-5 lg:hover:-translate-y-0.5 lg:hover:shadow-[var(--shadow-sm)]"
        style={{
          contentVisibility: "auto",
          containIntrinsicSize: "88px"
        }}
      >
        <Link
          aria-label={`Open ${tournament.name}`}
          className="absolute inset-0 z-0 rounded-[10px] focus-visible:outline-none"
          href={`/tournaments/${tournament.id}`}
          prefetch={false}
        />

        <div className="pointer-events-none z-10 hidden sm:flex sm:justify-start">
          <SpriteStrip className="-space-x-2 gap-0" size="lg" sprites={tournament.deckSprites} />
        </div>

        <div className="pointer-events-none z-10 min-w-0 max-sm:col-start-1 max-sm:row-start-1">
          <p className="text-[1.06rem] font-semibold leading-[1.25] tracking-[-0.015em] text-card-foreground sm:truncate">
            {tournament.name}
          </p>
          <p className="mt-1 text-sm leading-5 text-muted-foreground sm:truncate">
            {summarySubheading}
          </p>
        </div>

        <div className="pointer-events-none z-10 flex items-center gap-3 max-sm:col-start-1 max-sm:row-start-2 sm:hidden">
          <div
            className={`inline-flex w-fit items-center justify-center rounded-full border px-3 py-1 text-[0.72rem] font-semibold tracking-[0.04em] ${getTournamentPlacementPillClassName(tournament.placement)}`}
          >
            {placementLabel}
          </div>

          <div className="font-display text-[1.05rem] font-semibold tracking-[-0.03em] text-card-foreground">
            {getTournamentRecord(tournament.rounds)}
          </div>
        </div>

        <div
          className={`pointer-events-none z-10 hidden w-fit items-center justify-center rounded-full border px-3 py-1 text-[0.72rem] font-semibold tracking-[0.04em] sm:inline-flex sm:justify-self-center ${getTournamentPlacementPillClassName(tournament.placement)}`}
        >
          {placementLabel}
        </div>

        <div className="pointer-events-none z-10 hidden font-display text-[1.05rem] font-semibold tracking-[-0.03em] text-card-foreground sm:block sm:text-right">
          {getTournamentRecord(tournament.rounds)}
        </div>
      </div>
    </div>
  );
}

export function TournamentSummaryList({
  tournaments
}: {
  tournaments: TournamentSummary[];
}) {
  if (tournaments.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted p-6 text-sm text-muted-foreground">
        No tournaments yet. Create your first tournament to start tracking results.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {tournaments.map((tournament) => (
        <TournamentSummaryRow
          key={tournament.id}
          tournament={tournament}
        />
      ))}
    </div>
  );
}
