import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function runSafetyCheck(overrides: Record<string, string | undefined>) {
  const harnessPath = join(process.cwd(), "scripts/verify-tournament-db-atomicity.mjs");
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    PATH: process.env.PATH,
    POKENOTES_TOURNAMENT_DB_TEST_URL: "https://disposable-ref.supabase.co",
    POKENOTES_TOURNAMENT_DB_TEST_ANON_KEY: "test-anon-key",
    POKENOTES_TOURNAMENT_DB_TEST_SERVICE_ROLE_KEY: "test-service-role-key",
    ...overrides
  };

  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) {
      delete environment[key as keyof typeof environment];
    }
  }

  return spawnSync(process.execPath, [harnessPath, "--safety-check-only"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: environment
  });
}

test("remote safety behavior refuses missing canonical production identity", () => {
  const result = runSafetyCheck({
    POKENOTES_TOURNAMENT_DB_TEST_CONFIRM: "NON_PRODUCTION_DISPOSABLE"
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /require canonical production identity/);
});

test("remote safety behavior refuses the exact production target", () => {
  const result = runSafetyCheck({
    POKENOTES_PRODUCTION_SUPABASE_URL: "https://production-ref.supabase.co",
    POKENOTES_TOURNAMENT_DB_TEST_CONFIRM: "NON_PRODUCTION_DISPOSABLE",
    POKENOTES_TOURNAMENT_DB_TEST_URL: "https://production-ref.supabase.co"
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /production origin|production project ref/);
});

test("remote safety behavior canonicalizes equivalent production URL spellings", () => {
  const result = runSafetyCheck({
    POKENOTES_PRODUCTION_SUPABASE_URL: "https://production-ref.supabase.co:443/path",
    POKENOTES_TOURNAMENT_DB_TEST_CONFIRM: "NON_PRODUCTION_DISPOSABLE",
    POKENOTES_TOURNAMENT_DB_TEST_URL: "https://PRODUCTION-REF.supabase.co/"
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /production origin|production project ref/);
});

test("remote safety behavior strips terminal DNS root dots before production comparison", () => {
  for (const targetUrl of [
    "https://production-ref.supabase.co./",
    "https://production-ref.supabase.co.../"
  ]) {
    const result = runSafetyCheck({
      POKENOTES_PRODUCTION_SUPABASE_URL: "https://production-ref.supabase.co",
      POKENOTES_TOURNAMENT_DB_TEST_CONFIRM: "NON_PRODUCTION_DISPOSABLE",
      POKENOTES_TOURNAMENT_DB_TEST_URL: targetUrl
    });

    assert.notEqual(result.status, 0, targetUrl);
    assert.match(result.stderr, /production origin|production project ref/, targetUrl);
  }
});

test("remote safety behavior cannot override a URL-derived production project ref", () => {
  const result = runSafetyCheck({
    POKENOTES_PRODUCTION_SUPABASE_PROJECT_REF: "production-ref",
    POKENOTES_TOURNAMENT_DB_TEST_CONFIRM: "NON_PRODUCTION_DISPOSABLE",
    POKENOTES_TOURNAMENT_DB_TEST_PROJECT_REF: "claimed-disposable-ref",
    POKENOTES_TOURNAMENT_DB_TEST_URL: "https://production-ref.supabase.co"
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /production project ref/);
});

test("remote safety behavior retains the disposable confirmation gate", () => {
  const result = runSafetyCheck({
    POKENOTES_PRODUCTION_SUPABASE_URL: "https://production-ref.supabase.co"
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /NON_PRODUCTION_DISPOSABLE/);
});

test("remote safety behavior permits an explicit disposable target without network access", () => {
  const result = runSafetyCheck({
    POKENOTES_PRODUCTION_SUPABASE_URL: "https://production-ref.supabase.co",
    POKENOTES_TOURNAMENT_DB_TEST_CONFIRM: "NON_PRODUCTION_DISPOSABLE"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS tournament database target safety checks/);
});

test("the tournament database harness supports required mode", () => {
  const harness = source("scripts/verify-tournament-db-atomicity.mjs");
  const packageJson = source("package.json");

  assert.match(harness, /process\.argv\.includes\("--require"\)/);
  assert.match(harness, /POKENOTES_PRODUCTION_SUPABASE_PROJECT_REF/);
  assert.match(harness, /NON_PRODUCTION_DISPOSABLE/);
  assert.match(packageJson, /"test:tournament-db:required"/);
});

test("the real database harness covers success, rollback, ordering, concurrency, isolation, and ACLs", () => {
  const harness = source("scripts/verify-tournament-db-atomicity.mjs");

  assert.match(harness, /expectedCommitError/);
  assert.match(harness, /assert\.equal\(await maybeSingle\("decks", "id", faultDeckId\), null\)/);
  assert.match(harness, /assert\.equal\(await maybeSingle\("deck_lists", "id", faultListId\), null\)/);
  assert.match(harness, /assert\.equal\(successCommitResult, "committed"\)/);
  assert.match(harness, /assert\.equal\(ownerDecks\.length, 1\)/);
  assert.match(harness, /assert\.deepEqual\(ownerDeck\.deck_lists\[0\]\.sortedCards, expectedSortedCards\)/);
  assert.match(harness, /assert\.deepEqual\(relationalList\.sorted_cards, expectedSortedCards\)/);
  assert.match(harness, /assert\.equal\(relationalList\.sorted_cards_version, 2\)/);
  assert.match(harness, /assert\.equal\(linkedTournament\.linked_deck_id, successDeckId\)/);
  assert.match(harness, /assert\.equal\(linkedTournament\.linked_deck_list_id, successListId\)/);
  assert.match(harness, /assert\.equal\(retryCommitResult, "already-linked"\)/);
  assert.match(harness, /assert\.equal\(deckCountAfterRetry, 1\)/);
  assert.match(harness, /assert\.equal\(listCountAfterRetry, 1\)/);
  assert.match(harness, /Promise\.allSettled\(/);
  assert.match(harness, /verify tracked tournaments removed/);
  assert.match(harness, /verify tracked rounds removed/);
  assert.match(harness, /verify tracked decks removed/);
  assert.match(harness, /verify tracked deck lists removed/);
  assert.match(harness, /Tournament database integration and cleanup both failed/);
  assert.match(harness, /integration suite completed after verified cleanup/);
  assert.match(harness, /Promise\.all\(\[[\s\S]*create_tournament_round/);
  assert.match(harness, /\[1, 2\]/);
  assert.match(harness, /otherSession\.rpc/);
  assert.match(harness, /anon\.rpc\("create_tournament_round"/);
  assert.match(harness, /anon\.rpc\([\s\S]*"commit_tournament_deck_list"/);
  assert.match(harness, /Authenticated deck-list execute must reach the function body/);
  assert.match(harness, /42501\|permission denied/);
});
