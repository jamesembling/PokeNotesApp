"use client";

import Link from "next/link";
import {
  focusWithinRolloverClassName,
  tournamentEntryRolloverClassName
} from "@/components/ui/rolloverStyles";
import { SectionHeader } from "@/components/ui/SectionHeader";
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
    <div className="group/row">
      <div
        className={[
          "group/card relative grid w-full grid-cols-1 gap-x-3 gap-y-3 overflow-hidden rounded-[10px] border border-border bg-card p-4 text-left sm:grid-cols-[82px_minmax(0,1fr)_7.5rem_minmax(5.5rem,auto)] sm:items-center sm:gap-4 lg:grid-cols-[98px_minmax(0,1fr)_7.5rem_minmax(5.5rem,auto)] lg:px-5",
          tournamentEntryRolloverClassName,
          focusWithinRolloverClassName
        ].join(" ")}
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

        <div className="pointer-events-none z-10 hidden min-w-0 overflow-hidden sm:flex sm:justify-start">
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
    <section className="flex flex-col gap-4" aria-labelledby="tournament-history-heading">
      <SectionHeader
        eyebrow={`${tournaments.length} ${tournaments.length === 1 ? "event" : "events"} · Most recent first`}
        title="Tournament history"
        titleId="tournament-history-heading"
      />
      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <div className="hidden border-b border-border bg-muted px-4 py-2.5 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:grid sm:grid-cols-[82px_minmax(0,1fr)_7.5rem_minmax(5.5rem,auto)] sm:items-center sm:gap-4 lg:grid-cols-[98px_minmax(0,1fr)_7.5rem_minmax(5.5rem,auto)] lg:px-5">
          <span aria-hidden="true" />
          <span>Event</span>
          <span className="justify-self-center">Placement</span>
          <span className="justify-self-end">Record</span>
        </div>
        <div className="divide-y divide-border">
          {tournaments.map((tournament) => (
            <TournamentSummaryRow
              key={tournament.id}
              tournament={tournament}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
