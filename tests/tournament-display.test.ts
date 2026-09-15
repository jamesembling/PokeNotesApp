import assert from "node:assert/strict";
import test from "node:test";
import {
  getRoundResultGameTokens,
  getRoundSpecialResult,
  getTournamentRecord
} from "@/lib/tournaments/display";
import {
  getTournamentCompetitionBadge,
  getTournamentJudgeRoleLabel,
  parseTournamentJudgeRole,
  parseTournamentParticipation
} from "@/lib/tournaments/options";
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

test("tournament record counts match outcomes instead of individual games", () => {
  const record = getTournamentRecord([
    buildRound({ id: "round-1", roundNumber: 1, result: "WLW" }),
    buildRound({ id: "round-2", roundNumber: 2, result: "WW" }),
    buildRound({ id: "round-3", roundNumber: 3, result: "LWW" }),
    buildRound({ id: "round-4", roundNumber: 4, result: "WLL" })
  ]);

  assert.equal(record, "3-1");
});

test("tournament record counts tied and special round outcomes once per round", () => {
  const record = getTournamentRecord([
    buildRound({ id: "round-1", roundNumber: 1, result: "BYE" }),
    buildRound({ id: "round-2", roundNumber: 2, result: "ID" }),
    buildRound({ id: "round-3", roundNumber: 3, result: "NO SHOW" }),
    buildRound({ id: "round-4", roundNumber: 4, result: "WL" })
  ]);

  assert.equal(record, "2-0-2");
  assert.equal(parseTournamentParticipation(null), "player");
  assert.equal(parseTournamentParticipation("invalid"), "player");
  assert.equal(parseTournamentParticipation("judge"), "judge");
  assert.equal(parseTournamentJudgeRole("judge"), "judge");
  assert.equal(parseTournamentJudgeRole("head judge"), "head judge");
  assert.equal(parseTournamentJudgeRole("organizer"), "");
  assert.equal(getTournamentJudgeRoleLabel("head judge"), "Head Judge");
  assert.deepEqual(getTournamentCompetitionBadge("international"), {
    alt: "Pokémon International Championships badge",
    src: "/tournament-badges/international-championships.png"
  });
  assert.deepEqual(getTournamentCompetitionBadge("local"), {
    alt: "Play! Pokémon Friendly Tournament logo",
    src: "/tournament-badges/friendly-tournament.png"
  });
});
