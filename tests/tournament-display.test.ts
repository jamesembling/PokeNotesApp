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

test("special round results are detected for display and map to record tokens", () => {
  assert.deepEqual(getRoundResultGameTokens("BYE"), ["W"]);
  assert.deepEqual(getRoundResultGameTokens("ID"), ["T"]);
  assert.deepEqual(getRoundResultGameTokens("NO SHOW"), ["W"]);
  assert.equal(getRoundSpecialResult("BYE"), "BYE");
  assert.equal(getRoundSpecialResult("ID"), "ID");
  assert.equal(getRoundSpecialResult("NO SHOW"), "NO SHOW");
  assert.equal(getRoundSpecialResult("WL"), null);
});

test("tournament records count one outcome per round, including ties and special results", () => {
  const matchRecord = getTournamentRecord([
    buildRound({ id: "round-1", roundNumber: 1, result: "WLW" }),
    buildRound({ id: "round-2", roundNumber: 2, result: "WW" }),
    buildRound({ id: "round-3", roundNumber: 3, result: "LWW" }),
    buildRound({ id: "round-4", roundNumber: 4, result: "WLL" })
  ]);

  assert.equal(matchRecord, "3-1");

  const record = getTournamentRecord([
    buildRound({ id: "round-1", roundNumber: 1, result: "BYE" }),
    buildRound({ id: "round-2", roundNumber: 2, result: "ID" }),
    buildRound({ id: "round-3", roundNumber: 3, result: "NO SHOW" }),
    buildRound({ id: "round-4", roundNumber: 4, result: "WL" })
  ]);

  assert.equal(record, "2-0-2");
});

test("tournament participation, judge roles and competition badges fall back safely", () => {
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
  assert.deepEqual(getTournamentCompetitionBadge("prerelease"), {
    alt: "Pokémon Prerelease badge",
    darkSrc: "/tournament-badges/prerelease-dark.png",
    src: "/tournament-badges/prerelease.png"
  });
});
