import assert from "node:assert/strict";
import test from "node:test";
import { getBattleLogSummaryStats } from "@/lib/db/logs";
import type { BattleLogSummary } from "@/types/index";

function buildSummary(input: Partial<BattleLogSummary> & Pick<BattleLogSummary, "id" | "date" | "result">): BattleLogSummary {
  return {
    id: input.id,
    date: input.date,
    result: input.result,
    format: input.format ?? "SVI-TEF",
    goOrder: input.goOrder ?? "",
    selfPlayerName: input.selfPlayerName ?? "Self",
    selfDeckName: input.selfDeckName ?? "Deck",
    selfDeckSprites: input.selfDeckSprites ?? [],
    opponentPlayerName: input.opponentPlayerName ?? "Opponent",
    opponentDeckName: input.opponentDeckName ?? "Opp Deck",
    opponentDeckSprites: input.opponentDeckSprites ?? [],
    totalTurns: input.totalTurns ?? 0,
    linkedDeckId: input.linkedDeckId,
    linkedDeckListId: input.linkedDeckListId,
    importedAt: input.importedAt ?? `${input.date}T12:00:00.000Z`
  };
}

test("getBattleLogSummaryStats counts wins and losses", () => {
  const stats = getBattleLogSummaryStats([
    buildSummary({ id: "1", date: "2026-04-10", result: "Win" }),
    buildSummary({ id: "2", date: "2026-04-11", result: "Loss" }),
    buildSummary({ id: "3", date: "2026-04-12", result: "Win" })
  ]);

  assert.deepEqual(stats, {
    total: 3,
    wins: 2,
    losses: 1
  });
});
