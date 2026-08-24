import assert from "node:assert/strict";
import test from "node:test";
import {
  getAddedToHandDetailCard,
  getBattleLogDamageBreakdown,
  getBattleLogDetailEvent,
  getDisplayActionTag,
  getDisplayActionTagOverride,
  isCardListDetail
} from "@/lib/battle-log/detail-display";

test("battle-log display tags preserve resolved values and promote ambiguous attacks", () => {
  const directCases = [
    {
      name: "catalog-resolved ability wins over title heuristics",
      title: "iBerzrk_Network's Drakloak used Recon Directive.",
      details: [],
      resolvedActionTag: { label: "Ability", tag: "ability" },
      expected: "ability"
    },
    {
      name: "unresolved possessive used action falls back to attack",
      title: "iBerzrk_Network's Budew used Itchy Pollen.",
      details: [],
      resolvedActionTag: undefined,
      expected: "attack"
    }
  ] as const;

  for (const scenario of directCases) {
    assert.equal(
      getDisplayActionTag(scenario.title, [...scenario.details], scenario.resolvedActionTag),
      scenario.expected,
      scenario.name
    );
  }

  const overrideCases = [
    {
      name: "resolved ability override remains unchanged",
      title: "iBerzrk_Network's Drakloak used Recon Directive.",
      resolvedActionTag: { label: "Ability", tag: "ability" },
      expected: { label: "Ability", tag: "ability" }
    },
    {
      name: "unresolved attack gets an explicit override",
      title: "iBerzrk_Network's Budew used Itchy Pollen.",
      resolvedActionTag: undefined,
      expected: { label: "Attack", tag: "attack" }
    },
    {
      name: "resolved item override remains unchanged",
      title: "JammerUK1993 played Buddy-Buddy Poffin.",
      resolvedActionTag: { label: "Item", tag: "item" },
      expected: { label: "Item", tag: "item" }
    }
  ] as const;

  for (const scenario of overrideCases) {
    assert.deepEqual(
      getDisplayActionTagOverride(scenario.title, [], scenario.resolvedActionTag),
      scenario.expected,
      scenario.name
    );
  }
});

test("battle-log detail events preserve cards, counts, and destinations", () => {
  const cases = [
    {
      name: "single-card discard",
      actual: () => getBattleLogDetailEvent("Ignition Energy was discarded from Greninja ex."),
      expected: {
        cards: ["Ignition Energy"],
        icon: "discard",
        label: "Discarded",
        outcome: "1 card from Greninja ex"
      }
    },
    {
      name: "count discard strips the owner prefix",
      actual: () =>
        getBattleLogDetailEvent("2 cards were discarded from _ndz's Cynthia's Roserade."),
      expected: {
        icon: "discard",
        label: "Discarded",
        outcome: "2 cards from Cynthia's Roserade"
      }
    },
    {
      name: "named draw cards",
      actual: () =>
        getBattleLogDetailEvent("JammerUK1993 drew Rare Candy, Surfing Beach, Greninja ex"),
      expected: {
        cards: ["Rare Candy", "Surfing Beach", "Greninja ex"],
        icon: "draw",
        label: "Drew",
        outcome: "3 cards"
      }
    },
    {
      name: "anonymous draw count",
      actual: () => getBattleLogDetailEvent("JammerUK1993 drew 3 cards"),
      expected: {
        cards: [],
        icon: "draw",
        label: "Drew",
        outcome: "3 cards"
      }
    },
    {
      name: "multi-word added-to-hand card",
      actual: () => getAddedToHandDetailCard("Basic Water Energy was added to B3xCharz24's hand"),
      expected: {
        card: "Basic Water Energy",
        destination: "B3xCharz24's hand"
      }
    },
    {
      name: "shuffle card text",
      actual: () =>
        getBattleLogDetailEvent("JammerUK1993 shuffled Dudunsparce, Dunsparce into their deck"),
      expected: {
        icon: "shuffle",
        label: "Shuffled",
        outcome: "Dudunsparce, Dunsparce"
      }
    }
  ];

  for (const scenario of cases) {
    assert.deepEqual(scenario.actual(), scenario.expected, scenario.name);
  }
});

test("damage breakdown parsing accepts structured rows and rejects invalid groups", () => {
  const cases = [
    {
      name: "structured breakdown",
      input: [
        "Damage breakdown:",
        "Base damage: 40 damage",
        "(Ability) Cheer On to Glory: 30 damage",
        "(Item) Premium Power Pro: 30 damage",
        "Total damage: 100 damage"
      ],
      expected: {
        items: [
          {
            damage: "40 damage",
            label: "Base damage",
            tone: "base"
          },
          {
            damage: "30 damage",
            label: "(Ability) Cheer On to Glory",
            tone: "modifier"
          },
          {
            damage: "30 damage",
            label: "(Item) Premium Power Pro",
            tone: "modifier"
          },
          {
            damage: "100 damage",
            label: "Total damage",
            tone: "total"
          }
        ],
        label: "Damage breakdown"
      }
    },
    {
      name: "wrong heading",
      input: ["Not breakdown:", "Base damage: 40 damage"],
      expected: null
    },
    {
      name: "malformed group",
      input: ["Damage breakdown:", "Something without damage"],
      expected: null
    }
  ] as const;

  for (const scenario of cases) {
    assert.deepEqual(
      getBattleLogDamageBreakdown([...scenario.input]),
      scenario.expected,
      scenario.name
    );
  }
});

test("card-list detail detection accepts plain lists and rejects action sentences", () => {
  assert.equal(isCardListDetail("Rare Candy, Surfing Beach, Greninja ex"), true);
  assert.equal(isCardListDetail("JammerUK1993 drew Rare Candy, Surfing Beach"), false);
  assert.equal(isCardListDetail("Basic Fighting Energy was discarded from Greninja ex."), false);
});
