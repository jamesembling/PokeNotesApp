import assert from "node:assert/strict";
import test from "node:test";
import { buildImportDate } from "@/lib/log-import/import-date";

test("buildImportDate uses the London calendar day instead of the UTC day", () => {
  assert.equal(
    buildImportDate(new Date("2026-06-09T23:45:44.122Z")),
    "2026-06-10"
  );
});

test("buildImportDate preserves the UTC day when London has not crossed midnight", () => {
  assert.equal(
    buildImportDate(new Date("2026-06-09T22:45:44.122Z")),
    "2026-06-09"
  );
});
