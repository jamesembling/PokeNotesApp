"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MoreHorizontalIcon } from "lucide-react";
import { deleteTournamentAction } from "@/app/(app)/tournaments/actions";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Button } from "@/components/shadcn/button";
import { DeleteConfirmDialog } from "@/components/ui/DeleteConfirmDialog";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { TrashIcon } from "@/components/ui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/shadcn/dropdown-menu";
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
          className="group relative grid w-full grid-cols-1 gap-3 overflow-hidden rounded-[10px] border border-border bg-muted px-4 py-4 text-left transition duration-200 hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:grid-cols-[4rem_minmax(0,1.7fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_4.5rem_4.5rem] sm:items-center sm:gap-4 lg:px-5 lg:hover:-translate-y-0.5 lg:hover:shadow-[var(--shadow-sm)]"
          href={`/tournaments/${tournament.id}`}
          prefetch={false}
          style={{
            contentVisibility: "auto",
            containIntrinsicSize: "88px"
          }}
        >
          <div className="hidden sm:flex sm:justify-start">
            <SpriteStrip className="-space-x-2 gap-0" size="lg" sprites={tournament.deckSprites} />
          </div>

          <div className="min-w-0">
            <p className="truncate text-[1.06rem] font-semibold leading-[1.25] tracking-[-0.015em] text-card-foreground">
              {tournament.name}
            </p>
          </div>

          <div className="text-sm text-muted-foreground sm:text-base">
            {formatDayDate(tournament.dateFrom)}
          </div>

          <div className="text-sm text-muted-foreground sm:text-base">
            {tournament.format || "No format"}
          </div>

          <div className="text-sm font-semibold text-muted-foreground sm:text-base sm:text-center">
            {placementLabel}
          </div>

          <div className="font-display text-[1.05rem] font-semibold tracking-[-0.03em] text-card-foreground sm:text-right">
            {getTournamentRecord(tournament.rounds)}
          </div>
        </Link>

        <div className="flex justify-end transition duration-200 sm:pointer-events-none sm:translate-x-1 sm:opacity-0 sm:pr-1 sm:group-hover/row:pointer-events-auto sm:group-hover/row:translate-x-0 sm:group-hover/row:opacity-100 sm:group-focus-within/row:pointer-events-auto sm:group-focus-within/row:translate-x-0 sm:group-focus-within/row:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={`Open actions for ${tournament.name}`}
                className="text-muted-foreground hover:text-card-foreground"
                disabled={isDeleting}
                size="icon-lg"
                variant="ghost"
              >
                <MoreHorizontalIcon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                className="text-[var(--color-loss-strong)] focus:text-[var(--color-loss-strong)]"
                onClick={() => onRequestDelete(tournament)}
                variant="destructive"
              >
                <TrashIcon className="h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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
