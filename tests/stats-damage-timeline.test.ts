import assert from "node:assert/strict";
import test from "node:test";
import { summarizeDamageTimelineWindow } from "@/lib/stats/damage-timeline";

test("damage timeline windows preserve all-time numbering and window totals", () => {
  assert.deepEqual(
    summarizeDamageTimelineWindow(
      [
        { selfAttackDamage: 120, opponentAttackDamage: 80 },
        { selfAttackDamage: 180, opponentAttackDamage: 200 }
      ],
      5002,
      900_000,
      800_000
    ),
    {
      attackDamage: 300,
      endGame: 5002,
      isTruncated: true,
      opponentAttackDamage: 280,
      startGame: 5001
    }
  );
});

test("damage timeline falls back to all-time totals when there are no points", () => {
  assert.deepEqual(summarizeDamageTimelineWindow([], 0, 120, 90), {
    attackDamage: 120,
    endGame: 1,
    isTruncated: false,
    opponentAttackDamage: 90,
    startGame: 1
  });
});
