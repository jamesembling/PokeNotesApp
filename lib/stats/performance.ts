import type { Result } from "@/types/index";

type PerformanceTimelinePoint = {
  date: string;
  result?: Result | null;
};

export type PerformanceTrendPoint = {
  gameNumber: number;
  playedAt: string;
  winRate: number | null;
  gamesPlayed: number;
  knownResults: number;
  wins: number;
  losses: number;
};

export type RecentResult = {
  gameNumber: number;
  playedAt: string;
  result: Result | null;
};

const TREND_GAMES = 50;
const ROLLING_GAMES = 20;
const RECENT_RESULTS = 10;

function knownResult(result: PerformanceTimelinePoint["result"]): Result | null {
  return result === "Win" || result === "Loss" ? result : null;
}

function winRate(wins: number, losses: number) {
  const knownResults = wins + losses;
  return knownResults > 0 ? Math.round((wins / knownResults) * 100) : null;
}

/** Derive recent results from the chronological, bounded history actually loaded. */
export function getRecentPerformance(
  points: readonly PerformanceTimelinePoint[],
  allTimeGames: number,
  requestedGames = 50
) {
  const loadedGames = points.length;
  const totalGames = Math.max(
    loadedGames,
    Number.isFinite(allTimeGames) ? Math.max(0, Math.round(allTimeGames)) : 0
  );
  const requestedWindow = Number.isFinite(requestedGames)
    ? Math.max(1, Math.round(requestedGames))
    : TREND_GAMES;
  const summaryStart = Math.max(0, loadedGames - requestedWindow);
  const trendStart = Math.max(0, loadedGames - TREND_GAMES);
  const recentStart = Math.max(0, loadedGames - RECENT_RESULTS);
  const firstLoadedGame = totalGames - loadedGames + 1;
  const scanStart = Math.min(summaryStart, Math.max(0, trendStart - ROLLING_GAMES + 1));
  const trend: PerformanceTrendPoint[] = [];
  const recentResults: RecentResult[] = [];
  let gamesWon = 0;
  let gamesLost = 0;
  let rollingWins = 0;
  let rollingLosses = 0;

  for (let index = scanStart; index < loadedGames; index += 1) {
    const point = points[index];
    const result = knownResult(point.result);
    const gameNumber = firstLoadedGame + index;

    if (index >= summaryStart) {
      gamesWon += result === "Win" ? 1 : 0;
      gamesLost += result === "Loss" ? 1 : 0;
    }

    rollingWins += result === "Win" ? 1 : 0;
    rollingLosses += result === "Loss" ? 1 : 0;

    const expiredIndex = index - ROLLING_GAMES;
    if (expiredIndex >= scanStart) {
      const expiredResult = knownResult(points[expiredIndex].result);
      rollingWins -= expiredResult === "Win" ? 1 : 0;
      rollingLosses -= expiredResult === "Loss" ? 1 : 0;
    }

    if (index >= trendStart) {
      trend.push({
        gameNumber,
        playedAt: point.date,
        winRate: winRate(rollingWins, rollingLosses),
        gamesPlayed: Math.min(index + 1, ROLLING_GAMES),
        knownResults: rollingWins + rollingLosses,
        wins: rollingWins,
        losses: rollingLosses
      });
    }

    if (index >= recentStart) {
      recentResults.push({ gameNumber, playedAt: point.date, result });
    }
  }

  const gamesPlayed = loadedGames - summaryStart;
  const knownResults = gamesWon + gamesLost;

  return {
    gamesPlayed,
    gamesWon,
    gamesLost,
    unknownResults: gamesPlayed - knownResults,
    knownResults,
    winRate: winRate(gamesWon, gamesLost),
    startGame: gamesPlayed > 0 ? firstLoadedGame + summaryStart : null,
    endGame: gamesPlayed > 0 ? totalGames : null,
    isTruncated: loadedGames < totalGames,
    loadedGames,
    totalGames,
    requestedGames: requestedWindow,
    isWindowComplete: gamesPlayed >= Math.min(requestedWindow, totalGames),
    trend,
    recentResults
  };
}
