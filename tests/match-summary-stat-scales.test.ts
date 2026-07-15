import assert from "node:assert/strict";
import test from "node:test";
import {
  getStatBarHalfWidth,
  MATCH_SUMMARY_STAT_MAX
} from "@/lib/battle-log/match-summary-stats";

test("match summary stats use fixed representative scales", () => {
  assert.deepEqual(MATCH_SUMMARY_STAT_MAX, {
    attackDamage: 1000,
    mulligans: 5,
    prizes: 6,
    turns: 10
  });
});

test("stat bars scale within one half and cap values above the maximum", () => {
  assert.equal(getStatBarHalfWidth(0, 6), 0);
  assert.ok(Math.abs(getStatBarHalfWidth(2, 6) - 50 / 3) < 1e-12);
  assert.ok(Math.abs(getStatBarHalfWidth(5, 6) - 125 / 3) < 1e-12);
  assert.equal(getStatBarHalfWidth(6, 6), 50);
  assert.equal(getStatBarHalfWidth(8, 6), 50);
  assert.equal(getStatBarHalfWidth(-1, 6), 0);
});
