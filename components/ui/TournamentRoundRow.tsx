"use client";

import { LazyTournamentRoundEditorButton } from "@/components/ui/LazyTournamentRoundEditorButton";
import { Button } from "@/components/shadcn/button";
import { ChevronIcon } from "@/components/ui/icons";
import { tournamentEntryRolloverClassName } from "@/components/ui/rolloverStyles";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { getBattleLogOpponentDisplayName } from "@/lib/battle-log/display";
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
    return "text-win";
  }

  if (result === "L") {
    return "text-loss";
  }

  return "text-warning";
}

export function TournamentRoundRow({ canEdit, round, tournamentId }: TournamentRoundRowProps) {
  const gameResults = getRoundResultGameTokens(round.result);
  const specialResult = getRoundSpecialResult(round.result);
  const opponentDeckName = getBattleLogOpponentDisplayName(
    round.opponentDeckName,
    round.opponentDeckSprites
  );
  const rowVariant = getRoundResultVariant(round.result);
  const rowTone =
    rowVariant === "win"
      ? "border-win-border bg-win-bg"
      : rowVariant === "loss"
        ? "border-loss-border bg-loss-bg"
        : "border-warning-border bg-warning-bg";

  const rowContent = (
    <div className={["group relative grid w-full grid-cols-[4rem_minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-2 rounded-2xl border p-4 text-left md:grid-cols-[auto_1fr_auto_auto] md:gap-4", tournamentEntryRolloverClassName, rowTone].join(" ")}>
      <p className="font-display text-[1.05rem] font-semibold tracking-[-0.03em] text-card-foreground dark:text-white md:col-start-1">
        Round {round.roundNumber}
      </p>

      <div className="flex min-w-0 items-center justify-center gap-3 justify-self-center md:col-start-2 md:justify-self-start">
        <SpriteStrip className="-space-x-2 gap-0" size="lg" sprites={round.opponentDeckSprites} />
        <span className="hidden min-w-0 truncate text-[0.95rem] font-semibold text-card-foreground md:inline">
          VS {opponentDeckName}
        </span>
      </div>

      <div className="justify-self-end md:col-start-3">
        <div className="flex items-center justify-end gap-0.5">
          {specialResult ? (
            <span
              className={[
                "font-display text-[1rem] font-semibold tracking-[-0.04em]",
                rowVariant === "win"
                  ? "text-win"
                  : rowVariant === "loss"
                    ? "text-loss"
                    : "text-warning"
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
            <span className="font-display text-[1.05rem] font-semibold tracking-[-0.04em] text-muted-foreground">
              -
            </span>
          )}
        </div>
      </div>

      {canEdit ? (
        <div className="justify-self-end text-foreground md:col-start-4">
          <ChevronIcon className="size-4 -rotate-90" />
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
          <Button className="h-auto w-full p-0 hover:bg-transparent" type="button" variant="ghost">
            {rowContent}
          </Button>
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
