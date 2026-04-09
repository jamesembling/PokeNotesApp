import { formatDayDate } from "@/lib/client/date-format";
import type { TournamentRound, TournamentRoundResult } from "@/types/index";

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
  const totals = rounds.reduce(
    (accumulator, round) => {
      if (round.result === "Win") {
        accumulator.wins += 1;
      } else if (round.result === "Loss") {
        accumulator.losses += 1;
      } else {
        accumulator.ties += 1;
      }

      return accumulator;
    },
    { wins: 0, losses: 0, ties: 0 }
  );

  return totals.ties > 0
    ? `${totals.wins}-${totals.losses}-${totals.ties}`
    : `${totals.wins}-${totals.losses}`;
}

export function getRoundResultVariant(result: TournamentRoundResult): "default" | "win" | "loss" {
  if (result === "Win") {
    return "win";
  }

  if (result === "Loss") {
    return "loss";
  }

  return "default";
}
