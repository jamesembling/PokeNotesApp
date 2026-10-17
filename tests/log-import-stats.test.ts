import assert from "node:assert/strict";
import test from "node:test";
import { buildStats } from "@/lib/log-import/parser/stats";
import { divideIntoSections } from "@/lib/log-import/parser/turns";
import { getPrizesTakenFromLine, isPrizeTakenLine } from "@/lib/log-import/parser/stats";
import type { LogSection } from "@/types/index";

function buildSections(actions: LogSection["actions"][]): LogSection[] {
  return [
    {
      title: "Turn # 1 - Self's Turn",
      player: "Self",
      actions: actions[0] ?? [],
      prizesAfterTurn: {
        Self: 6,
        Opponent: 6
      }
    },
    {
      title: "Turn # 2 - Opponent's Turn",
      player: "Opponent",
      actions: actions[1] ?? [],
      prizesAfterTurn: {
        Self: 6,
        Opponent: 6
      }
    }
  ];
}

test("buildStats counts Mirage Barrage damage listed in action details", () => {
  const stats = buildStats({
    lines: [". Self wins."],
    language: "en",
    selfPlayerName: "Self",
    opponentPlayerName: "Opponent",
    sections: buildSections([
      [
        {
          title: "Self's Greninja ex used Mirage Barrage.",
          details: [
            "- Opponent's Dreepy took 120 damage.",
            "- Opponent's Munkidori took 120 damage.",
            "- Ignition Energy was discarded from Self's Greninja ex."
          ]
        }
      ],
      []
    ])
  });

  assert.equal(stats.selfAttackDamage, 240);
  assert.equal(stats.opponentAttackDamage, 0);

  // Real PTCGL appendix: the breakdown precedes the nested Festival Lead attack.
  const sections = divideIntoSections({
    language: "en",
    playerNames: ["Self", "Opponent"],
    getPrizesTakenFromLine,
    isPrizeTakenLine,
    lines: [
      "Turn # 1 - Self's Turn",
      "Opponent's Dipplin used Festival Lead.",
      "- Damage breakdown:",
      "• 5 Benched Pokémon: 100 damage",
      "- Opponent's Dipplin used Do the Wave on Self's Munkidori for 100 damage.",
      "- Opponent chose Do the Wave"
    ]
  });
  assert.equal(sections[0]?.actions[0]?.title, "Opponent's Dipplin used Festival Lead.");
  const nested = buildStats({
    lines: [". Self wins."],
    sections,
    language: "en",
    selfPlayerName: "Self",
    opponentPlayerName: "Opponent"
  });
  assert.equal(nested.selfAttackDamage, 0);
  assert.equal(nested.opponentAttackDamage, 100, "the recorded actor wins over the enclosing turn");

  const attack = "Self's Dipplin used Do the Wave on Opponent's Munkidori for 100 damage.";
  const duplicated = buildStats({
    lines: [". Self wins."],
    language: "en",
    selfPlayerName: "Self",
    opponentPlayerName: "Opponent",
    sections: buildSections([
      [{ title: attack, details: [`- ${attack}`, "• 5 Benched Pokémon: 100 damage"] }],
      []
    ])
  });
  assert.equal(duplicated.selfAttackDamage, 100, "a repeated nested attack record counts once");
  const repeated = buildStats({
    lines: [". Self wins."], language: "en", selfPlayerName: "Self", opponentPlayerName: "Opponent",
    sections: buildSections([[{ title: "Self's Dipplin used Festival Lead.", details: [`- ${attack}`, `- ${attack}`] }], []])
  });
  assert.equal(repeated.selfAttackDamage, 200, "two recorded Festival Lead attacks remain two attacks");
});

test("buildStats adds Mirage Barrage title damage and benched damage details", () => {
  const stats = buildStats({
    lines: [". Self wins."],
    language: "en",
    selfPlayerName: "Self",
    opponentPlayerName: "Opponent",
    sections: buildSections([
      [
        {
          title: "Self's Greninja ex used Mirage Barrage on Opponent's Active for 120 damage.",
          details: [
            "- Opponent's Benched Pokemon took 120 damage.",
            "- Ignition Energy was discarded from Self's Greninja ex."
          ]
        }
      ],
      []
    ])
  });

  assert.equal(stats.selfAttackDamage, 240);
  assert.equal(stats.opponentAttackDamage, 0);
});

test("divideIntoSections groups unprefixed took-damage lines with the prior action", () => {
  const sections = divideIntoSections({
    language: "en",
    playerNames: ["Self", "Opponent"],
    getPrizesTakenFromLine,
    isPrizeTakenLine,
    lines: [
      "Turn # 1 - Opponent's Turn",
      "Opponent's Greninja ex used Mirage Barrage.",
      "Self's Bayleef took 120 damage.",
      "Self's Psyduck took 120 damage.",
      "Opponent wins."
    ]
  });

  const mirageAction = sections[0]?.actions[0];

  assert.equal(mirageAction?.title, "Opponent's Greninja ex used Mirage Barrage.");
  assert.deepEqual(mirageAction?.details, [
    "Self's Bayleef took 120 damage.",
    "Self's Psyduck took 120 damage."
  ]);
});

test("divideIntoSections promotes ability activation lines above their effect details", () => {
  const sections = divideIntoSections({
    language: "en",
    playerNames: ["Self", "Opponent"],
    getPrizesTakenFromLine,
    isPrizeTakenLine,
    lines: [
      "Turn # 1 - Self's Turn",
      "Self played Dudunsparce.",
      "Dudunsparce's Run Away Draw was activated.",
      "- Self drew 3 cards.",
      "- Rare Candy, Surfing Beach, Greninja ex",
      "- Self shuffled 2 cards into their deck.",
      "- Dudunsparce, Dunsparce"
    ]
  });

  assert.deepEqual(sections[0]?.actions, [
    {
      title: "Self played Dudunsparce.",
      details: []
    },
    {
      title: "Dudunsparce's Run Away Draw was activated.",
      details: [
        "- Self drew 3 cards.",
        "- Rare Candy, Surfing Beach, Greninja ex",
        "- Self shuffled 2 cards into their deck.",
        "- Dudunsparce, Dunsparce"
      ]
    }
  ]);
});
