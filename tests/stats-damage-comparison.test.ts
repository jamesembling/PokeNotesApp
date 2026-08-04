import assert from "node:assert/strict";
import test from "node:test";
import { compareDamageTotals } from "@/lib/stats/damage-comparison";

test("damage advantage percentage uses opponent damage as its comparison baseline", () => {
  assert.deepEqual(compareDamageTotals(300, 200), {
    difference: 100,
    leader: "self",
    percentage: 50
  });
});

test("damage deficit percentage uses player damage as its comparison baseline", () => {
  assert.deepEqual(compareDamageTotals(200, 300), {
    difference: 100,
    leader: "opponent",
    percentage: 50
  });
});

test("equal damage reports no leader and zero percentage difference", () => {
  assert.deepEqual(compareDamageTotals(240, 240), {
    difference: 0,
    leader: "equal",
    percentage: 0
  });
});

test("positive damage against a zero comparison baseline has no finite percentage", () => {
  assert.deepEqual(compareDamageTotals(120, 0), {
    difference: 120,
    leader: "self",
    percentage: null
  });
  assert.deepEqual(compareDamageTotals(0, 120), {
    difference: 120,
    leader: "opponent",
    percentage: null
  });
});
