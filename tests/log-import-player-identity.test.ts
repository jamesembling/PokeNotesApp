import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseBattleLog } from "@/lib/log-import/parser";
import type { IdentificationCatalog } from "@/lib/log-import/types";
import {
  canonicalizeSelfPlayerSections,
  resolveSelfOpponent
} from "@/lib/log-import/parser/players";

test("player identities preserve outcomes, stats and card evidence", () => {
  // Change only player identities in the committed export, never action wording.
  const source = readFileSync("tests/e2e/fixtures/battle-log-valid.txt", "utf8");
  const catalog: IdentificationCatalog = {
    pokemon: {
      bySlug: new Map(),
      normalizedNameToSlug: new Map([
        ["dreepy", "dreepy"],
        ["charmander", "charmander"],
        ["charizard", "charizard"]
      ]),
      slugToAncestors: new Map(),
      slugToFamilyRoot: new Map(),
      maxNameTokens: 1
    },
    archetypes: {
      byId: new Map(),
      normalizedLabelToIds: new Map(),
      spriteToCandidateArchetypes: new Map(),
      familyRootToCandidateArchetypes: new Map()
    }
  };
  for (const [self, opponent] of [
    ["Trainer", "OtherTrainer"],
    ["Trainer[+]", "Opponent"],
    ["Trainer", "Other. Trainer"],
    ["Dreepy", "Charizard"],
    ["Other. Trainer", "Trainer"],
    ["-Trainer", "Opponent"]
  ]) {
    const parsed = parseBattleLog({
      rawLog: source.replaceAll("E2ETrainer", self).replaceAll("FixtureOpponent", opponent),
      ptcglUsername: self,
      catalog
    });
    assert.equal(parsed.stats.result, "Win", `${opponent}: winner attribution`);
    assert.equal(parsed.stats.selfAttackDamage, 200, `${self}: damage attribution`);
    assert.equal(parsed.sections[1].prizesAfterTurn[self], 5, `${self}: prize attribution`);
    assert.equal(parsed.stats.coinTossWon, true);
    const opposite = parseBattleLog({ rawLog: parsed.rawLog, ptcglUsername: opponent, catalog });
    assert.equal(opposite.stats.result, "Loss");
    assert.equal(opposite.stats.coinTossWon, false);

    assert.deepEqual(
      [...parsed.pokemonEvidence.self.mentionCounts],
      [["dreepy", 1]],
      `${self}: own card evidence only`
    );
    assert.deepEqual(
      [...parsed.pokemonEvidence.opponent.mentionCounts],
      [["charmander", 1]],
      `${opponent}: own card evidence only`
    );
  }

  assert.throws(
    () =>
      parseBattleLog({
        rawLog: source.replace("E2ETrainer wins.", "UnknownTrainer wins."),
        ptcglUsername: "E2ETrainer",
        catalog
      }),
    /exactly one winner/,
    "an unrelated winner must not silently become a loss"
  );
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
