import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("the tournament database harness refuses production and supports required mode", () => {
  const harness = source("scripts/verify-tournament-db-atomicity.mjs");
  const packageJson = source("package.json");

  assert.match(harness, /process\.argv\.includes\("--require"\)/);
  assert.match(harness, /Refusing to run tournament database integration tests against a configured production URL/);
  assert.match(harness, /NON_PRODUCTION_DISPOSABLE/);
  assert.match(packageJson, /"test:tournament-db:required"/);
});

test("the real database harness covers rollback, concurrency, tenant isolation, and ACLs", () => {
  const harness = source("scripts/verify-tournament-db-atomicity.mjs");

  assert.match(harness, /expectedCommitError/);
  assert.match(harness, /assert\.equal\(await maybeSingle\("decks", "id", faultDeckId\), null\)/);
  assert.match(harness, /assert\.equal\(await maybeSingle\("deck_lists", "id", faultListId\), null\)/);
  assert.match(harness, /Promise\.all\(\[[\s\S]*create_tournament_round/);
  assert.match(harness, /\[1, 2\]/);
  assert.match(harness, /otherSession\.rpc/);
  assert.match(harness, /anon\.rpc\("create_tournament_round"/);
  assert.match(harness, /42501\|permission denied/);
});
