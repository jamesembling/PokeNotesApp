import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("Deck List release gate is executable and no longer draft", () => {
  const packageJson = source("package.json");
  const workflow = source(".github/workflows/deploy-production-database.yml");
  const deployOrder = source("docs/deck-list-first-class-deploy-order.md");

  assert.match(packageJson, /"verify:deck-list-release"/);
  assert.match(workflow, /npm run verify:deck-list-release/);
  assert.doesNotMatch(deployOrder, /intentionally a draft/i);
  for (const contract of [
    "RLS",
    "ownership",
    "relational",
    "legacy",
    "visual ordering",
    "rollback",
    "migration-first",
    "application second"
  ]) {
    assert.match(deployOrder, new RegExp(contract, "i"));
  }
});

test("release workflow checks the repository contract before any migration apply", () => {
  const workflow = source(".github/workflows/deploy-production-database.yml");
  const contract = workflow.indexOf("npm run verify:deck-list-release");
  const dryRun = workflow.indexOf("supabase db push", contract);
  assert.ok(contract >= 0);
  assert.ok(dryRun > contract);
});
