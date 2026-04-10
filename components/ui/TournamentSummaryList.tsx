"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteTournamentAction } from "@/app/(app)/tournaments/actions";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { TrashIcon } from "@/components/ui/icons";
import { formatDayDate } from "@/lib/client/date-format";
import { getTournamentRecord } from "@/lib/tournaments/display";
import { getTournamentPlacementLabel } from "@/lib/tournaments/options";
import type { TournamentSummary } from "@/types/index";

function TournamentSummaryRow({
  deletingId,
  onDelete,
  tournament
}: {
  deletingId: string | null;
  onDelete: (tournament: TournamentSummary) => void;
  tournament: TournamentSummary;
}) {
  const placementLabel = tournament.placement
    ? getTournamentPlacementLabel(tournament.placement)
    : "No placement";
  const isDeleting = deletingId === tournament.id;

  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
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

      <div className="flex justify-end sm:pr-1">
        <button
          aria-label={`Delete tournament ${tournament.name}`}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--bg-surface-alt)] hover:text-[var(--color-loss-strong)] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isDeleting}
          onClick={() => onDelete(tournament)}
          type="button"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function TournamentSummaryList({
  tournaments
}: {
  tournaments: TournamentSummary[];
}) {
  const router = useRouter();
  const [deleteError, setDeleteError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(tournament: TournamentSummary) {
    const confirmed = window.confirm(
      `Delete "${tournament.name}" and all of its rounds? This cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    setDeleteError("");
    setDeletingId(tournament.id);

    try {
      const formData = new FormData();
      formData.set("tournamentId", tournament.id);
      const result = await deleteTournamentAction(formData);
      router.push(result.redirectTo);
      router.refresh();
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Could not delete this tournament."
      );
      setDeletingId(null);
    }
  }

  if (tournaments.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-surface-alt)] p-6 text-sm text-[var(--text-muted)]">
        No tournaments yet. Create your first tournament to start tracking results.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {deleteError ? (
        <div className="rounded-2xl border border-[var(--color-loss-border)] bg-[var(--color-loss-bg)] p-4 text-sm text-[var(--color-loss)]">
          {deleteError}
        </div>
      ) : null}

      {tournaments.map((tournament) => (
        <TournamentSummaryRow
          deletingId={deletingId}
          key={tournament.id}
          onDelete={handleDelete}
          tournament={tournament}
        />
      ))}
    </div>
  );
}
