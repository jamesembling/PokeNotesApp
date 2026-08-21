import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("CI runs the repository design-system audit", () => {
  const workflow = source(".github/workflows/ci.yml");

  assert.match(workflow, /- name: Design system audit\s+run: npm run design:audit/);
});

test("GitHub workflows pin their Node action releases", () => {
  const ciWorkflow = source(".github/workflows/ci.yml");
  const databaseWorkflow = source(".github/workflows/deploy-production-database.yml");
  const checkoutV7 = /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\.0\.1/;
  const setupNodeV7 = /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7\.0\.0/;

  assert.match(ciWorkflow, checkoutV7);
  assert.match(ciWorkflow, setupNodeV7);
  assert.match(databaseWorkflow, checkoutV7);
  assert.doesNotMatch(`${ciWorkflow}\n${databaseWorkflow}`, /actions\/(?:checkout|setup-node)@v4|# v4/);
});
