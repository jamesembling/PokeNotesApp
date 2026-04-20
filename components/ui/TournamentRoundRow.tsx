import { LazyTournamentRoundEditorButton } from "@/components/ui/LazyTournamentRoundEditorButton";
import { ChevronIcon } from "@/components/ui/icons";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import {
  getRoundResultGameTokens,
  getRoundResultVariant,
  getRoundSpecialResult
} from "@/lib/tournaments/display";
import type { TournamentRound, TournamentRoundGameResult } from "@/types/index";

type TournamentRoundRowProps = {
  canEdit: boolean;
  round: TournamentRound;
  tournamentId: string;
};

function getRoundResultTextColor(result: TournamentRoundGameResult) {
  if (result === "W") {
    return "text-[var(--color-win)]";
  }

  if (result === "L") {
    return "text-[var(--color-loss)]";
  }

  return "text-[var(--color-warning)]";
}

export function TournamentRoundRow({ canEdit, round, tournamentId }: TournamentRoundRowProps) {
  const gameResults = getRoundResultGameTokens(round.result);
  const specialResult = getRoundSpecialResult(round.result);
  const rowVariant = getRoundResultVariant(round.result);
  const rowTone =
    rowVariant === "win"
      ? "border-[var(--color-win-border)] bg-[var(--color-win-bg)]"
      : rowVariant === "loss"
        ? "border-[var(--color-loss-border)] bg-[var(--color-loss-bg)]"
        : "border-[var(--color-warning-border)] bg-[var(--color-warning-bg)]";

  const rowContent = (
    <div className={["group grid w-full gap-4 rounded-2xl border p-4 text-left transition duration-200 hover:brightness-[0.98] md:grid-cols-[auto_1fr_auto_auto] md:items-center lg:hover:-translate-y-0.5 lg:hover:shadow-[var(--shadow-sm)]", rowTone].join(" ")}>
      <div className="space-y-1">
        <p className="ui-eyebrow">Round</p>
        <p className="font-display text-[1.12rem] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
          {round.roundNumber}
        </p>
      </div>

      <div className="md:justify-self-start">
        <SpriteStrip className="-space-x-2 gap-0" size="lg" sprites={round.opponentDeckSprites} />
      </div>

      <div className="md:justify-self-end">
        <div className="flex items-center justify-end gap-0.5">
          {specialResult ? (
            <span
              className={[
                "font-display text-[1rem] font-semibold tracking-[-0.04em]",
                rowVariant === "win"
                  ? "text-[var(--color-win)]"
                  : rowVariant === "loss"
                    ? "text-[var(--color-loss)]"
                    : "text-[var(--color-warning)]"
              ].join(" ")}
            >
              {specialResult}
            </span>
          ) : gameResults.length > 0 ? (
            gameResults.map((token, index) => (
              <span
                className={[
                  "font-display text-[1.05rem] font-semibold tracking-[-0.04em]",
                  getRoundResultTextColor(token)
                ].join(" ")}
                key={`${token}-${index}`}
              >
                {token}
              </span>
            ))
          ) : (
            <span className="font-display text-[1.05rem] font-semibold tracking-[-0.04em] text-[var(--text-muted)]">
              —
            </span>
          )}
        </div>
      </div>

      {canEdit ? (
        <div className="text-[var(--text-secondary)] md:justify-self-end">
          <ChevronIcon className="h-4 w-4 -rotate-90" />
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
