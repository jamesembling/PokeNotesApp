import Link from "next/link";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { formatDayDate } from "@/lib/client/date-format";
import { getTournamentRecord } from "@/lib/tournaments/display";
import { getTournamentPlacementLabel } from "@/lib/tournaments/options";
import type { TournamentSummary } from "@/types/index";

function TournamentSummaryRow({ tournament }: { tournament: TournamentSummary }) {
  const placementLabel = tournament.placement
    ? getTournamentPlacementLabel(tournament.placement)
    : "No placement";

  return (
    <Link
      className="grid w-full grid-cols-1 gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-4 text-left transition hover:brightness-[0.98] sm:grid-cols-[4rem_minmax(0,1.7fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_4.5rem_4.5rem] sm:items-center sm:gap-4 lg:px-5"
      href={`/tournaments/${tournament.id}`}
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: "88px"
      }}
    >
      <div className="hidden sm:flex sm:justify-start">
        <SpriteStrip className="-space-x-2 gap-0" size="lg" sprites={tournament.deckSprites} />
      </div>

      <div className="min-w-0">
        <p className="truncate text-[1.06rem] font-semibold leading-[1.25] tracking-[-0.015em] text-[var(--text-primary)]">
          {tournament.name}
        </p>
      </div>

      <div className="text-sm text-[var(--text-muted)] sm:text-base">
        {formatDayDate(tournament.dateFrom)}
      </div>

      <div className="text-sm text-[var(--text-muted)] sm:text-base">
        {tournament.format || "No format"}
      </div>

      <div className="text-sm font-semibold text-[var(--text-muted)] sm:text-base sm:text-center">
        {placementLabel}
      </div>

      <div className="font-display text-[1.05rem] font-semibold tracking-[-0.03em] text-[var(--text-primary)] sm:text-right">
        {getTournamentRecord(tournament.rounds)}
      </div>
    </Link>
  );
}

export function TournamentSummaryList({
  tournaments
}: {
  tournaments: TournamentSummary[];
}) {
  if (tournaments.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-surface-alt)] p-6 text-sm text-[var(--text-muted)]">
        No tournaments yet. Create your first tournament to start tracking results.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {tournaments.map((tournament) => (
        <TournamentSummaryRow key={tournament.id} tournament={tournament} />
      ))}
    </div>
  );
}
