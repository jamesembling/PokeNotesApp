import { Badge } from "@/components/ui/Badge";
import { LazyTournamentRoundEditorButton } from "@/components/ui/LazyTournamentRoundEditorButton";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { getRoundResultVariant } from "@/lib/tournaments/display";
import type { TournamentRound } from "@/types/index";

type TournamentRoundRowProps = {
  canEdit: boolean;
  round: TournamentRound;
  tournamentId: string;
};

function getRoundRowTone(result: TournamentRound["result"]) {
  if (result === "Win") {
    return "border-[var(--color-win-border)] bg-[var(--color-win-bg)]";
  }

  if (result === "Tie") {
    return "border-[var(--color-warning-border)] bg-[var(--color-warning-bg)]";
  }

  return "border-[var(--color-loss-border)] bg-[var(--color-loss-bg)]";
}

export function TournamentRoundRow({ canEdit, round, tournamentId }: TournamentRoundRowProps) {
  const rowContent = (
    <div className={["grid w-full gap-4 rounded-2xl border p-4 text-left transition hover:brightness-[0.98] md:grid-cols-[auto_1fr_auto_auto_auto] md:items-center", getRoundRowTone(round.result)].join(" ")}>
      <div className="space-y-1">
        <p className="ui-eyebrow">Round</p>
        <p className="font-display text-[1.12rem] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
          {round.roundNumber}
        </p>
      </div>

      <div className="md:justify-self-start">
        <SpriteStrip className="-space-x-2 gap-0" size="lg" sprites={round.opponentDeckSprites} />
      </div>

      <div className="space-y-1 min-w-0">
        <p className="ui-eyebrow">Opponent Deck</p>
        <p className="truncate text-sm font-medium text-[var(--text-primary)]">
          {round.opponentDeckName}
        </p>
      </div>

      <div className="md:justify-self-end">
        <Badge variant={getRoundResultVariant(round.result)}>{round.result}</Badge>
      </div>

      {canEdit ? (
        <div className="text-sm font-medium text-[var(--text-secondary)] md:justify-self-end">
          Edit Round
        </div>
      ) : null}
    </div>
  );

  if (canEdit) {
    return (
      <LazyTournamentRoundEditorButton
        round={round}
        suggestedRoundNumber={round.roundNumber}
        tournamentId={tournamentId}
        trigger={(
          <button type="button">
            {rowContent}
          </button>
        )}
        triggerLabel="Edit Round"
        triggerVariant="ghost"
      />
    );
  }

  return (
    rowContent
  );
}
