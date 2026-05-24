import assert from "node:assert/strict";
import test from "node:test";
import { getDisplayActionTag } from "@/components/ui/BattleLogDetailView";

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
