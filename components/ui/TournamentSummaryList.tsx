"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronRightIcon, XIcon } from "lucide-react";
import { deleteTournamentAction } from "@/app/(app)/tournaments/actions";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Button } from "@/components/shadcn/button";
import { DeleteConfirmDialog } from "@/components/ui/DeleteConfirmDialog";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { formatDayDate } from "@/lib/client/date-format";
import { getTournamentRecord } from "@/lib/tournaments/display";
import { getTournamentCategoryLabel, getTournamentPlacementLabel } from "@/lib/tournaments/options";
import { getTournamentPlacementPillClassName } from "@/lib/tournaments/placement-pill";
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
  const summarySubheading = [
    formatDayDate(tournament.dateFrom),
    tournament.category ? getTournamentCategoryLabel(tournament.category) : "",
    tournament.format || "No format"
  ]
    .filter(Boolean)
    .join(" · ");
  const isDeleting = deletingId === tournament.id;
  const isConfirming = confirmingId === tournament.id;

  return (
    <div className="group/row space-y-2">
      <div
        className="group/card relative grid w-full grid-cols-[minmax(0,1fr)_2rem_1.25rem] gap-3 overflow-hidden rounded-[10px] border border-border bg-muted px-4 py-4 text-left transition duration-200 hover:brightness-[0.98] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background sm:grid-cols-[4rem_minmax(0,1fr)_7.5rem_minmax(5.5rem,auto)_2rem_1.25rem] sm:items-center sm:gap-4 lg:px-5 lg:hover:-translate-y-0.5 lg:hover:shadow-[var(--shadow-sm)]"
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

        <Button
          aria-label={`Delete ${tournament.name}`}
          className="z-20 bg-muted text-muted-foreground hover:bg-[var(--color-loss-bg)] hover:text-[var(--color-loss-strong)] max-sm:col-start-2 max-sm:row-span-2 max-sm:row-start-1 max-sm:self-center sm:col-start-5"
          disabled={isDeleting}
          onClick={() => onRequestDelete(tournament)}
          size="icon-sm"
          variant="ghost"
        >
          <XIcon className="h-4 w-4" />
        </Button>

        <ChevronRightIcon
          aria-hidden="true"
          className="pointer-events-none z-10 h-4 w-4 self-center justify-self-end text-muted-foreground transition group-hover/card:translate-x-0.5 group-hover/card:text-card-foreground max-sm:col-start-3 max-sm:row-span-2 max-sm:row-start-1 sm:col-start-6"
        />
      </div>

      <DeleteConfirmDialog
        confirmLabel={isDeleting ? "Deleting..." : "Yes, delete"}
        disabled={isDeleting}
        message={`Delete "${tournament.name}" and all of its rounds? This cannot be undone.`}
        onCancel={onCancelDelete}
        onConfirm={() => onConfirmDelete(tournament)}
        open={isConfirming}
      />
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

    const formData = new FormData();
    formData.set("tournamentId", tournament.id);
    const result = await deleteTournamentAction(formData);

    if (!result.ok) {
      setDeleteError(result.message);
      setDeletingId(null);
      return;
    }

    setConfirmingId(null);
    router.push(result.redirectTo);
    router.refresh();
  }

  if (tournaments.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted p-6 text-sm text-muted-foreground">
        No tournaments yet. Create your first tournament to start tracking results.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {deleteError ? (
        <Alert
          className="border-[var(--color-loss-border)] bg-[var(--color-loss-bg)] text-[var(--color-loss)]"
          variant="destructive"
        >
          <AlertDescription>{deleteError}</AlertDescription>
        </Alert>
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
