import { formatDayDate } from "@/lib/client/date-format";
import { TOURNAMENT_ROUND_SPECIAL_RESULT_OPTIONS } from "@/lib/tournaments/options";
import type {
  TournamentRound,
  TournamentRoundGameResult,
  TournamentRoundResult,
  TournamentRoundSpecialResult
} from "@/types/index";

const TOURNAMENT_ROUND_SPECIAL_RESULT_TOKEN_MAP: Record<
  TournamentRoundSpecialResult,
  TournamentRoundGameResult[]
> = {
  BYE: ["W"],
  ID: ["T"],
  "NO SHOW": ["W"]
};
const TOURNAMENT_MONTH_FORMATTER = new Intl.DateTimeFormat("en-GB", { month: "short" });

export function formatTournamentDateRange(dateFrom: string, dateTo: string) {
  if (dateFrom === dateTo) {
    return formatDayDate(dateFrom);
  }

  const from = new Date(`${dateFrom}T00:00:00`);
  const to = new Date(`${dateTo}T00:00:00`);

  const sameMonth =
    from.getUTCFullYear() === to.getUTCFullYear() && from.getUTCMonth() === to.getUTCMonth();

  if (sameMonth) {
    const month = TOURNAMENT_MONTH_FORMATTER.format(from);
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

function getTournamentRecordBreakdown(rounds: TournamentRound[]) {
  const totals = rounds.reduce(
    (accumulator, round) => {
      const roundOutcome = getRoundResultVariant(round.result);

      if (roundOutcome === "win") {
        accumulator.wins += 1;
        return accumulator;
      }

      if (roundOutcome === "loss") {
        accumulator.losses += 1;
        return accumulator;
      }

      accumulator.ties += 1;

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

export function getRoundSpecialResult(result: TournamentRoundResult): TournamentRoundSpecialResult | null {
  return TOURNAMENT_ROUND_SPECIAL_RESULT_OPTIONS.some((option) => option.value === result)
    ? (result as TournamentRoundSpecialResult)
    : null;
}

export function getRoundResultGameTokens(result: TournamentRoundResult): TournamentRoundGameResult[] {
  const specialResult = getRoundSpecialResult(result);
  if (specialResult) {
    return TOURNAMENT_ROUND_SPECIAL_RESULT_TOKEN_MAP[specialResult];
  }

  if (result === "Win") {
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
