import { formatDayDate } from "@/lib/client/date-format";
import type {
  TournamentRound,
  TournamentRoundGameResult,
  TournamentRoundResult
} from "@/types/index";

export function formatTournamentDateRange(dateFrom: string, dateTo: string) {
  if (dateFrom === dateTo) {
    return formatDayDate(dateFrom);
  }

  const from = new Date(`${dateFrom}T00:00:00`);
  const to = new Date(`${dateTo}T00:00:00`);

  const sameMonth =
    from.getUTCFullYear() === to.getUTCFullYear() && from.getUTCMonth() === to.getUTCMonth();

  if (sameMonth) {
    const month = new Intl.DateTimeFormat("en-GB", { month: "short" }).format(from);
    return `${from.getUTCDate()}-${to.getUTCDate()} ${month} ${to.getUTCFullYear()}`;
  }

  return `${formatDayDate(dateFrom)} - ${formatDayDate(dateTo)}`;
}

export function getTournamentRecord(rounds: TournamentRound[]) {
  const totals = getTournamentRecordBreakdown(rounds);

  return totals.ties > 0
    ? `${totals.wins}-${totals.losses}-${totals.ties}`
    : `${totals.wins}-${totals.losses}`;
}

export function getTournamentRecordBreakdown(rounds: TournamentRound[]) {
  const totals = rounds.reduce(
    (accumulator, round) => {
      const gameResults = getRoundResultGameTokens(round.result);

      gameResults.forEach((gameResult) => {
        if (gameResult === "W") {
          accumulator.wins += 1;
          return;
        }

        if (gameResult === "L") {
          accumulator.losses += 1;
          return;
        }

        accumulator.ties += 1;
      });

      return accumulator;
    },
    { wins: 0, losses: 0, ties: 0 }
  );

  return totals;
}

export function getRoundResultVariant(
  result: TournamentRoundResult
): "default" | "win" | "loss" | "warning" {
  const gameResults = getRoundResultGameTokens(result);
  const wins = gameResults.filter((token) => token === "W").length;
  const losses = gameResults.filter((token) => token === "L").length;

  if (wins === 0 && losses === 0) {
    return "warning";
  }

  if (wins > losses) {
    return "win";
  }

  if (losses > wins) {
    return "loss";
  }

  return "warning";
}

export function getRoundResultGameTokens(result: TournamentRoundResult): TournamentRoundGameResult[] {
  if (result === "Win" || result === "BYE") {
    return ["W"];
  }

  if (result === "Loss") {
    return ["L"];
  }

  if (result === "Tie") {
    return ["T"];
  }

  return result
    .split("")
    .filter((token): token is TournamentRoundGameResult => token === "W" || token === "L" || token === "T")
    .slice(0, 3);
}
