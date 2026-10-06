import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("CI runs the repository design-system audit", () => {
  const workflow = source(".github/workflows/ci.yml");
  const databaseWorkflow = source(".github/workflows/database-behavior.yml");

  assert.match(workflow, /- name: Design system audit\s+run: npm run design:audit/);
  assert.match(databaseWorkflow, /workflow_dispatch:/);
  assert.match(databaseWorkflow, /permissions:\s+contents: read/);
  assert.match(databaseWorkflow, /'lib\/', 'app\/', 'components\/', 'types\/'/);
  assert.match(databaseWorkflow, /playwright install --with-deps chromium/);
  assert.match(databaseWorkflow, /run: timeout 10m npm run e2e:local:import\n/);
  assert.match(databaseWorkflow, /run: timeout 10m npm run e2e:local:import -- --expired-session/);
  assert.match(databaseWorkflow, /include-hidden-files: true/);
  assert.match(databaseWorkflow, /retention-days: 3/);
  assert.doesNotMatch(databaseWorkflow, /secrets\.|--linked|\.env\.e2e\.local\s*$/m);

  const fixture = mkdtempSync(join(tmpdir(), "pokenotes-design-audit-"));
  try {
    mkdirSync(join(fixture, "app"));
    mkdirSync(join(fixture, "components", "ui"), { recursive: true });
    writeFileSync(join(fixture, "app", "globals.css"), source("app/globals.css"));
    writeFileSync(join(fixture, "components", "ui", "AppDialog.tsx"), source("components/ui/AppDialog.tsx"));
    const cssPath = join(fixture, "components", "sample.module.css");
    writeFileSync(cssPath, `
      .sample { --local-size: 2rem; width: var(--local-size); color: var(--foreground); }
      @property --local-angle { syntax: "<angle>"; inherits: true; initial-value: 0deg; }
      .sample { rotate: var(--local-angle); }
    `);
    const audit = () => spawnSync(process.execPath, [join(process.cwd(), "scripts/design-system-audit.mjs")],
      { cwd: fixture, encoding: "utf8" });
    const declared = audit();
    assert.equal(declared.status, 0, declared.stderr);

    writeFileSync(join(fixture, "components", "other.module.css"), ".other { --foreign-size: 1rem; }");
    writeFileSync(cssPath, `
      /* --comment-size: 1rem; @property --comment-angle {} */
      .sample { width: var(--foreign-size); height: var(--comment-size); rotate: var(--comment-angle); color: #123456; }
    `);
    const undeclared = audit();
    assert.equal(undeclared.status, 1);
    for (const name of ["foreign-size", "comment-size", "comment-angle"]) {
      assert.ok(undeclared.stderr.includes(`Undefined CSS token --${name}.`), undeclared.stderr);
    }
    assert.ok(undeclared.stderr.includes("Use CSS tokens instead of raw color literals."));
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("CI uses the minimum Node runtime supported by Supabase", () => {
  const ciWorkflow = source(".github/workflows/ci.yml");
  const packageJson = JSON.parse(source("package.json")) as {
    engines?: { node?: string };
  };

  assert.match(ciWorkflow, /node-version: 22/);
  assert.equal(packageJson.engines?.node, ">=22.0.0");
});

test("GitHub workflows pin their Node action releases", () => {
  const ciWorkflow = source(".github/workflows/ci.yml");
  const databaseWorkflow = source(".github/workflows/deploy-production-database.yml");
  const behaviorWorkflow = source(".github/workflows/database-behavior.yml");
  const checkoutV7 = /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\.0\.1/;
  const setupNodeV7 = /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7\.0\.0/;
  const setupSupabaseV3 = /supabase\/setup-cli@46f7f98c7f948ad727d22c1e67fab04c223a0520 # v3\.0\.0/;

  assert.match(ciWorkflow, checkoutV7);
  assert.match(ciWorkflow, setupNodeV7);
  assert.match(databaseWorkflow, checkoutV7);
  assert.match(databaseWorkflow, setupSupabaseV3);
  assert.match(behaviorWorkflow, checkoutV7);
  assert.match(behaviorWorkflow, setupNodeV7);
  assert.match(behaviorWorkflow, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4\.6\.2/);
  assert.doesNotMatch(`${ciWorkflow}\n${databaseWorkflow}`, /actions\/(?:checkout|setup-node)@v4|# v4/);
  assert.doesNotMatch(databaseWorkflow, /supabase\/setup-cli@.*# v1/);
});
