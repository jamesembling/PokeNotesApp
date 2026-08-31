import assert from "node:assert/strict";
import test from "node:test";
import { getRecentPerformance } from "@/lib/stats/performance";
import type { Result } from "@/types/index";

test("recent performance preserves game numbering and rolling result history", () => {
  const points = Array.from({ length: 70 }, (_, index): { date: string; result: Result } => ({
    date: "2026-08-30",
    result: (index >= 20 && index < 60) || index === 69 ? "Win" : "Loss"
  }));
  const performance = getRecentPerformance(points, 5070, 25);

  assert.equal(performance.gamesPlayed, 25);
  assert.equal(performance.gamesWon, 16);
  assert.equal(performance.gamesLost, 9);
  assert.equal(performance.unknownResults, 0);
  assert.equal(performance.knownResults, 25);
  assert.equal(performance.winRate, 64);
  assert.equal(performance.startGame, 5046);
  assert.equal(performance.endGame, 5070);
  assert.equal(performance.isTruncated, true);
  assert.equal(performance.loadedGames, 70);
  assert.equal(performance.requestedGames, 25);
  assert.equal(performance.isWindowComplete, true);
  assert.equal(performance.trend.length, 50);
  assert.deepEqual(performance.trend[0], {
    gameNumber: 5021,
    playedAt: "2026-08-30",
    winRate: 5,
    gamesPlayed: 20,
    knownResults: 20,
    wins: 1,
    losses: 19
  });
  assert.equal(performance.trend[19].winRate, 100);
  assert.deepEqual(performance.trend.at(-1), {
    gameNumber: 5070,
    playedAt: "2026-08-30",
    winRate: 55,
    gamesPlayed: 20,
    knownResults: 20,
    wins: 11,
    losses: 9
  });
  assert.equal(performance.recentResults.length, 10);
  assert.deepEqual(performance.recentResults[0], {
    gameNumber: 5061,
    playedAt: "2026-08-30",
    result: "Loss"
  });
  assert.deepEqual(performance.recentResults.at(-1), {
    gameNumber: 5070,
    playedAt: "2026-08-30",
    result: "Win"
  });
});

test("empty and incomplete performance windows keep unknown results out of win rates", () => {
  assert.deepEqual(getRecentPerformance([], 0), {
    gamesPlayed: 0,
    gamesWon: 0,
    gamesLost: 0,
    unknownResults: 0,
    knownResults: 0,
    winRate: null,
    startGame: null,
    endGame: null,
    isTruncated: false,
    loadedGames: 0,
    totalGames: 0,
    requestedGames: 50,
    isWindowComplete: true,
    trend: [],
    recentResults: []
  });

  const sparse = getRecentPerformance([
    { date: "2026-08-26" },
    { date: "2026-08-27", result: "Win" },
    { date: "2026-08-28", result: null },
    { date: "2026-08-29", result: "Loss" },
    { date: "2026-08-30", result: "Win" }
  ], 8);

  assert.equal(sparse.gamesPlayed, 5);
  assert.equal(sparse.knownResults, 3);
  assert.equal(sparse.unknownResults, 2);
  assert.equal(sparse.gamesWon, 2);
  assert.equal(sparse.gamesLost, 1);
  assert.equal(sparse.winRate, 67);
  assert.equal(sparse.startGame, 4);
  assert.equal(sparse.endGame, 8);
  assert.equal(sparse.isTruncated, true);
  assert.equal(sparse.isWindowComplete, false);
  assert.equal(sparse.trend[0].winRate, null);
  assert.equal(sparse.trend[1].winRate, 100);
  assert.equal(sparse.trend[1].knownResults, 1);
  assert.equal(sparse.trend[1].gamesPlayed, 2);
  assert.equal(sparse.trend.at(-1)?.winRate, 67);
  assert.equal(sparse.recentResults[0].result, null);

  const unavailable = getRecentPerformance([], 80);
  assert.equal(unavailable.isWindowComplete, false);
  assert.equal(unavailable.isTruncated, true);
  assert.equal(unavailable.startGame, null);
  assert.equal(unavailable.endGame, null);
  assert.equal(unavailable.winRate, null);
});
