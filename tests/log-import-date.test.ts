import assert from "node:assert/strict";
import test from "node:test";
import { buildImportDate } from "@/lib/log-import/import-date";

test("buildImportDate uses the London calendar day at the UTC midnight boundary", () => {
  assert.equal(
    buildImportDate(new Date("2026-06-09T23:45:44.122Z")),
    "2026-06-10"
  );
  assert.equal(
    buildImportDate(new Date("2026-06-09T22:45:44.122Z")),
    "2026-06-09"
  );
});
