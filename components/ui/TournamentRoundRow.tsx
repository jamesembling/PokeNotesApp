import { Badge } from "@/components/ui/Badge";
import { TournamentRoundEditorDialog } from "@/components/ui/TournamentRoundEditorDialog";
import { getRoundResultVariant } from "@/lib/tournaments/display";
import type { TournamentRound } from "@/types/index";

type TournamentRoundRowProps = {
  canEdit: boolean;
  round: TournamentRound;
  tournamentId: string;
};

export function TournamentRoundRow({ canEdit, round, tournamentId }: TournamentRoundRowProps) {
  return (
    <div className="grid gap-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface-alt)] p-4 md:grid-cols-[auto_1fr_auto_auto] md:items-center">
      <div className="space-y-1">
        <p className="ui-eyebrow">Round</p>
        <p className="font-display text-[1.12rem] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
          {round.roundNumber}
        </p>
      </div>

      <div className="space-y-1 min-w-0">
        <p className="ui-eyebrow">Opponent Deck</p>
        <p className="truncate text-sm font-medium text-[var(--text-primary)]">
          {round.opponentDeckName}
        </p>
        {round.notes ? (
          <p className="text-sm leading-6 text-[var(--text-muted)]">{round.notes}</p>
        ) : null}
      </div>

      <div className="md:justify-self-end">
        <Badge variant={getRoundResultVariant(round.result)}>{round.result}</Badge>
      </div>

      {canEdit ? (
        <div className="md:justify-self-end">
          <TournamentRoundEditorDialog
            round={round}
            suggestedRoundNumber={round.roundNumber}
            tournamentId={tournamentId}
            triggerLabel="Edit Round"
            triggerVariant="ghost"
          />
        </div>
      ) : null}
    </div>
  );
}
