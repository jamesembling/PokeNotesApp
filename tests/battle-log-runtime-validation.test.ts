import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeBattleLog,
  decodeDeckCards,
  decodeLogSections,
  decodeSerializedLogSections
} from "@/lib/battle-log/runtime-validation";
import type { BattleLog, LogSection } from "@/types/index";

function buildSections(): LogSection[] {
  return [
    {
      title: "Setup",
      player: "",
      actions: [{ title: "Drew seven cards", details: ["Card A"] }],
      prizesAfterTurn: { Self: 6, Opponent: 6 }
    }
  ];
}

function buildBattleLog(): BattleLog {
  return {
    id: "log-1",
    userId: "user-1",
    date: "2026-07-11",
    result: "Win",
    format: "SVI-ASC",
    goOrder: "First",
    selfPlayerName: "Self",
    selfDeckName: "Deck A",
    selfDeckSlug: "deck-a",
    selfDeckSprites: ["sprite-a"],
    opponentPlayerName: "Opponent",
    opponentDeckName: "Deck B",
    opponentDeckSlug: "deck-b",
    opponentDeckSprites: ["sprite-b"],
    totalTurns: 5,
    coinTossWon: true,
    selfPrizesTaken: 6,
    opponentPrizesTaken: 3,
    selfAttackDamage: 420,
    opponentAttackDamage: 220,
    selfMulligans: 0,
    opponentMulligans: 1,
    linkedDeckId: undefined,
    linkedDeckListId: undefined,
    matchNotes: null,
    reason: "Prizes",
    rawLog: "raw",
    sections: buildSections(),
    importedAt: "2026-07-11T10:00:00.000Z",
    createdAt: "2026-07-11T10:00:00.000Z",
    updatedAt: "2026-07-11T10:00:00.000Z"
  };
}

test("decodes complete nested battle log sections", () => {
  assert.deepEqual(decodeLogSections(buildSections()), buildSections());
});

test("rejects an entire sections value when a nested action is malformed", () => {
  const sections = buildSections() as unknown as Array<Record<string, unknown>>;
  sections[0] = {
    ...sections[0],
    actions: [{ title: "Missing details" }]
  };

  assert.equal(decodeLogSections(sections), null);
});

test("rejects non-numeric prize maps", () => {
  const sections = buildSections() as unknown as Array<Record<string, unknown>>;
  sections[0] = {
    ...sections[0],
    prizesAfterTurn: { Self: "six" }
  };

  assert.equal(decodeLogSections(sections), null);
});

test("decodes valid serialized sections but distinguishes missing and malformed submissions", () => {
  assert.deepEqual(decodeSerializedLogSections(JSON.stringify(buildSections())), buildSections());
  assert.deepEqual(decodeSerializedLogSections("[]"), []);
  assert.equal(decodeSerializedLogSections(""), null);
  assert.equal(decodeSerializedLogSections("not-json"), null);
  assert.equal(
    decodeSerializedLogSections(JSON.stringify([{ title: "Missing nested fields" }])),
    null
  );
});

test("decodes a complete Battle Log and normalizes null optional links", () => {
  const decoded = decodeBattleLog({
    ...buildBattleLog(),
    linkedDeckId: null,
    linkedDeckListId: null
  });

  assert.equal(decoded?.id, "log-1");
  assert.equal(decoded?.linkedDeckId, undefined);
  assert.equal(decoded?.linkedDeckListId, undefined);
});

test("rejects a Battle Log with a malformed nested section or stat", () => {
  assert.equal(decodeBattleLog({ ...buildBattleLog(), totalTurns: "five" }), null);
  assert.equal(
    decodeBattleLog({
      ...buildBattleLog(),
      sections: [{ ...buildSections()[0], actions: [{ title: "No details" }] }]
    }),
    null
  );
});

test("decodes valid Deck Cards and rejects malformed card payloads", () => {
  assert.deepEqual(
    decodeDeckCards([{ count: 2, name: "Pikachu", set: "SVP", number: "190" }]),
    [
      {
        count: 2,
        name: "Pikachu",
        set: "SVP",
        number: "190",
        category: undefined,
        trainerType: undefined,
        spriteUrl: undefined,
        stage: undefined
      }
    ]
  );
  assert.equal(decodeDeckCards([{ count: "2", name: "Pikachu" }]), null);
});
