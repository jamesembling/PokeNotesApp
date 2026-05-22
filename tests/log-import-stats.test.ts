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
