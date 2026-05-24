import assert from "node:assert/strict";
import test from "node:test";
import {
  getBattleLogDamageBreakdown,
  getBattleLogDetailEvent,
  getDisplayActionTag
} from "@/components/ui/BattleLogDetailView";

test("catalog-resolved ability tags are not reclassified as attacks", () => {
  assert.equal(
    getDisplayActionTag("iBerzrk_Network's Drakloak used Recon Directive.", [], {
      label: "Ability",
      tag: "ability"
    }),
    "ability"
  );
});

test("unresolved possessive used actions still fall back to attack display", () => {
  assert.equal(
    getDisplayActionTag("iBerzrk_Network's Budew used Itchy Pollen.", [], undefined),
    "attack"
  );
});

test("passive single-card discard details keep the discarded card name", () => {
  assert.deepEqual(
    getBattleLogDetailEvent("Ignition Energy was discarded from Greninja ex."),
    {
      cards: ["Ignition Energy"],
      icon: "discard",
      label: "Discarded",
      outcome: "1 card from Greninja ex"
    }
  );
});

test("passive discard detail events keep owned Pokemon names after display cleanup", () => {
  assert.deepEqual(
    getBattleLogDetailEvent("Basic Fighting Energy was discarded from _ndz's Cynthia's Roserade."),
    {
      cards: ["Basic Fighting Energy"],
      icon: "discard",
      label: "Discarded",
      outcome: "1 card from Cynthia's Roserade"
    }
  );
  assert.deepEqual(
    getBattleLogDetailEvent("2 cards were discarded from _ndz's Cynthia's Roserade."),
    {
      icon: "discard",
      label: "Discarded",
      outcome: "2 cards from Cynthia's Roserade"
    }
  );
});

test("damage breakdown detail groups are parsed as structured rows", () => {
  assert.deepEqual(
    getBattleLogDamageBreakdown([
      "Damage breakdown:",
      "Base damage: 40 damage",
      "(Ability) Cheer On to Glory: 30 damage",
      "(Item) Premium Power Pro: 30 damage",
      "Total damage: 100 damage"
    ]),
    {
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
  );
});
