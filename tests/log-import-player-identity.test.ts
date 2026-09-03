import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalizeSelfPlayerSections,
  resolveSelfOpponent
} from "@/lib/log-import/parser/players";

test("an alternate PTCGL username identifies the importing player's side", () => {
  assert.deepEqual(
    resolveSelfOpponent(["Opponent", "JJPokeMan2026"], "MainTrainer", ["  jjpokeman2026  "]),
    {
      selfPlayerName: "JJPokeMan2026",
      opponentPlayerName: "Opponent"
    }
  );
});

test("alternate identity is replaced throughout structured log display", () => {
  const [section] = canonicalizeSelfPlayerSections(
    [{
      title: "JJPokeMan2026's Turn",
      player: "JJPokeMan2026",
      actions: [{
        title: "JJPokeMan2026 played Arven.",
        details: [
          "JJPokeMan2026 drew 3 cards.",
          "Opponent drew 1 card.",
          "JJPokeMan2026Toolkit stayed unchanged."
        ]
      }],
      prizesAfterTurn: { JJPokeMan2026: 5, Opponent: 6 }
    }],
    "JJPokeMan2026",
    "MainTrainer"
  );

  assert.equal(section.title, "MainTrainer's Turn");
  assert.equal(section.player, "MainTrainer");
  assert.equal(section.actions[0].title, "MainTrainer played Arven.");
  assert.deepEqual(section.actions[0].details, [
    "MainTrainer drew 3 cards.",
    "Opponent drew 1 card.",
    "JJPokeMan2026Toolkit stayed unchanged."
  ]);
  assert.deepEqual(section.prizesAfterTurn, { MainTrainer: 5, Opponent: 6 });
});
