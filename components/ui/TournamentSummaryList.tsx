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
  confirmingId,
  deletingId,
  onCancelDelete,
  onConfirmDelete,
  onRequestDelete,
  tournament
}: {
  confirmingId: string | null;
  deletingId: string | null;
  onCancelDelete: () => void;
  onConfirmDelete: (tournament: TournamentSummary) => void;
  onRequestDelete: (tournament: TournamentSummary) => void;
  tournament: TournamentSummary;
}) {
  const placementLabel = tournament.placement
    ? getTournamentPlacementLabel(tournament.placement)
    : "No placement";
  const isDeleting = deletingId === tournament.id;
  const isConfirming = confirmingId === tournament.id;

  return (
    <div className="group/row space-y-2">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <Link
          className="group relative grid w-full grid-cols-1 gap-3 overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--bg-surface-alt)] px-4 py-4 text-left transition duration-200 hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-page)] sm:grid-cols-[4rem_minmax(0,1.7fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_4.5rem_4.5rem] sm:items-center sm:gap-4 lg:px-5 lg:hover:-translate-y-0.5 lg:hover:shadow-[var(--shadow-sm)]"
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

        <div className="flex justify-end transition duration-200 sm:pointer-events-none sm:translate-x-1 sm:opacity-0 sm:pr-1 sm:group-hover/row:pointer-events-auto sm:group-hover/row:translate-x-0 sm:group-hover/row:opacity-100 sm:group-focus-within/row:pointer-events-auto sm:group-focus-within/row:translate-x-0 sm:group-focus-within/row:opacity-100">
          <button
            aria-label={`Delete tournament ${tournament.name}`}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--bg-surface-alt)] hover:text-[var(--color-loss-strong)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isDeleting}
            onClick={() => onRequestDelete(tournament)}
            type="button"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isConfirming ? (
        <div className="rounded-2xl border border-[var(--color-loss-border)] bg-[var(--color-loss-bg)] p-4">
          <p className="text-sm text-[var(--text-primary)]">
            Delete &quot;{tournament.name}&quot; and all of its rounds? This cannot be undone.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              className="inline-flex items-center justify-center rounded-xl bg-[var(--color-danger)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isDeleting}
              onClick={() => onConfirmDelete(tournament)}
              type="button"
            >
              {isDeleting ? "Deleting..." : "Yes, delete"}
            </button>
            <button
              className="inline-flex items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-surface-alt)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isDeleting}
              onClick={onCancelDelete}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
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
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(tournament: TournamentSummary) {
    setDeleteError("");
    setDeletingId(tournament.id);

    try {
      const formData = new FormData();
      formData.set("tournamentId", tournament.id);
      const result = await deleteTournamentAction(formData);
      setConfirmingId(null);
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
          confirmingId={confirmingId}
          deletingId={deletingId}
          key={tournament.id}
          onCancelDelete={() => setConfirmingId(null)}
          onConfirmDelete={handleDelete}
          onRequestDelete={(selectedTournament) => {
            setDeleteError("");
            setConfirmingId(
              confirmingId === selectedTournament.id ? null : selectedTournament.id
            );
          }}
          tournament={tournament}
        />
      ))}
    </div>
  );
}
