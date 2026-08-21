import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("test filenames describe durable seams instead of delivery history", () => {
  const testFiles = readdirSync(join(process.cwd(), "tests")).filter((file) =>
    /\.test\.(?:ts|mjs)$/.test(file)
  );
  const deliveryHistoryName =
    /(?:^|[-_.])(?:pr\d+|review|re-review|correction|quick-wins?|p\d+-seams?|phase-?\d+|issue-board)(?:[-_.]|$)/i;

  assert.deepEqual(
    testFiles.filter((file) => deliveryHistoryName.test(file)),
    [],
    "Move durable regressions into behavior-owned files before merge."
  );
});
