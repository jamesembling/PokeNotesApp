import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { decodeLogSections } from "@/lib/battle-log/runtime-validation";
import { buildLocalE2EBattleLogFixture } from "@/scripts/local-e2e-battle-log-fixture";

test("local battle-log fixtures build renderable parsed sections and matching summaries", () => {
  const cases = [
    {
      file: "battle-log-valid.txt",
      opponentPlayerName: "FixtureOpponent",
      result: "Win",
      totalTurns: 2,
    },
    {
      file: "battle-log-loss-valid.txt",
      opponentPlayerName: "FixtureGardevoir",
      result: "Loss",
      totalTurns: 3,
    },
  ] as const;

  for (const expected of cases) {
    const fixture = buildLocalE2EBattleLogFixture({
      rawLog: readFileSync(
        join(process.cwd(), "tests/e2e/fixtures", expected.file),
        "utf8",
      ),
      ptcglUsername: "E2ETrainer",
    });

    assert.notEqual(decodeLogSections(fixture.sections), null);
    assert.equal(fixture.sections[0]?.title, "Setup");
    assert.equal(fixture.result, expected.result);
    assert.equal(fixture.selfPlayerName, "E2ETrainer");
    assert.equal(fixture.opponentPlayerName, expected.opponentPlayerName);
    assert.equal(fixture.totalTurns, expected.totalTurns);
  }
});
