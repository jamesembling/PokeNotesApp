import assert from "node:assert/strict";
import test from "node:test";
import {
  getRoundResultGameTokens,
  getRoundSpecialResult,
  getTournamentRecord
} from "@/lib/tournaments/display";
import type { TournamentRound } from "@/types/index";

function buildRound(
  input: Pick<TournamentRound, "id" | "roundNumber" | "result"> & Partial<TournamentRound>
): TournamentRound {
  return {
    id: input.id,
    tournamentId: input.tournamentId ?? "tournament-1",
    userId: input.userId ?? "user-1",
    roundNumber: input.roundNumber,
    opponentDeckName: input.opponentDeckName ?? "",
    opponentDeckSprites: input.opponentDeckSprites ?? [],
    result: input.result,
    notes: input.notes ?? "",
    createdAt: input.createdAt ?? "2026-04-20T10:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-04-20T10:00:00.000Z"
  };
}

test("special round results map to the right record tokens", () => {
  assert.deepEqual(getRoundResultGameTokens("BYE"), ["W"]);
  assert.deepEqual(getRoundResultGameTokens("ID"), ["T"]);
  assert.deepEqual(getRoundResultGameTokens("NO SHOW"), ["W"]);
});

test("special round results are detected for row display", () => {
  assert.equal(getRoundSpecialResult("BYE"), "BYE");
  assert.equal(getRoundSpecialResult("ID"), "ID");
  assert.equal(getRoundSpecialResult("NO SHOW"), "NO SHOW");
  assert.equal(getRoundSpecialResult("WL"), null);
});

test("tournament record counts ID as a tie and NO SHOW as a win", () => {
  const record = getTournamentRecord([
    buildRound({ id: "round-1", roundNumber: 1, result: "BYE" }),
    buildRound({ id: "round-2", roundNumber: 2, result: "ID" }),
    buildRound({ id: "round-3", roundNumber: 3, result: "NO SHOW" }),
    buildRound({ id: "round-4", roundNumber: 4, result: "WL" })
  ]);

  assert.equal(record, "3-1-1");
});
