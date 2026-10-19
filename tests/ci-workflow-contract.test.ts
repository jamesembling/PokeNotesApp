import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assessRuntimeAudit } from "../scripts/audit-runtime-dependencies.mjs";
import { decideMerge, normalizeCheck, readCodexReview } from "../scripts/merge-when-green.mjs";

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
  assert.match(databaseWorkflow, /run: timeout 10m npm run e2e:local:social/);
  assert.match(databaseWorkflow, /include-hidden-files: true/);
  assert.match(databaseWorkflow, /retention-days: 3/);
  assert.doesNotMatch(databaseWorkflow, /secrets\.|--linked|\.env\.e2e\.local\s*$/m);

  const fixture = mkdtempSync(join(tmpdir(), "pokenotes-design-audit-"));
  try {
    mkdirSync(join(fixture, "app"));
    mkdirSync(join(fixture, "components", "ui"), { recursive: true });
    mkdirSync(join(fixture, "components", "battle-replay"));
    writeFileSync(join(fixture, "app", "globals.css"), source("app/globals.css"));
    writeFileSync(
      join(fixture, "components", "ui", "AppDialog.tsx"),
      source("components/ui/AppDialog.tsx")
    );
    const cssPath = join(fixture, "components", "battle-replay", "battle-replay.module.css");
    writeFileSync(
      cssPath,
      `
      .sample { --replay-board-card-width: 2rem; width: var(--replay-board-card-width); color: var(--foreground); }
      @property --replay-turn-angle { syntax: "<angle>"; inherits: true; initial-value: 0deg; }
      .sample { rotate: var(--replay-turn-angle); translate: calc(var(--pile-offset) * 1rem); }
    `
    );
    const audit = () =>
      spawnSync(process.execPath, [join(process.cwd(), "scripts/design-system-audit.mjs")], {
        cwd: fixture,
        encoding: "utf8"
      });
    const declared = audit();
    assert.equal(declared.status, 0, declared.stderr);

    writeFileSync(
      join(fixture, "components", "other.module.css"),
      ".other { --foreign-size: 1rem; }"
    );
    writeFileSync(
      cssPath,
      `
      /* --preview-card-width: 1rem; @property --replay-turn-angle {} */
      .first { --sibling-size: 2rem; }
      .second { width: var(--sibling-size); }
      .sample { width: var(--foreign-size); height: var(--preview-card-width); rotate: var(--replay-turn-angle); color: #123456; }
    `
    );
    const undeclared = audit();
    assert.equal(undeclared.status, 1);
    for (const name of [
      "foreign-size",
      "sibling-size",
      "preview-card-width",
      "replay-turn-angle"
    ]) {
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
  assert.match(
    ciWorkflow,
    /Runtime dependency advisory gate\s+run: node scripts\/audit-runtime-dependencies.mjs/
  );
  const lock = {
    packages: {
      "": { dependencies: { next: "1", eslint: "1" } },
      "node_modules/next": { dependencies: { shared: "1" } },
      "node_modules/eslint": { dependencies: { shared: "1", lintOnly: "1" } },
      "node_modules/shared": {},
      "node_modules/lintOnly": {}
    }
  };
  const audit = {
    vulnerabilities: {
      shared: { severity: "high", nodes: ["node_modules/shared"] },
      lintOnly: { severity: "critical", nodes: ["node_modules/lintOnly"] },
      unknown: { severity: "high", nodes: ["node_modules/unmapped"] }
    }
  };
  assert.deepEqual(assessRuntimeAudit(lock, audit), {
    blocking: ["shared", "unknown"],
    buildOnly: ["lintOnly"]
  });
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
  assert.match(
    behaviorWorkflow,
    /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4\.6\.2/
  );
  assert.doesNotMatch(
    `${ciWorkflow}\n${databaseWorkflow}`,
    /actions\/(?:checkout|setup-node)@v4|# v4/
  );
  assert.doesNotMatch(databaseWorkflow, /supabase\/setup-cli@.*# v1/);
});

test("merge-when-green merges only labelled PRs whose head is fully green", () => {
  const head = "a".repeat(40);
  const green = {
    pr: {
      baseRefName: "main",
      headRefOid: head,
      isDraft: false,
      labels: ["merge-when-green"],
      mergeable: "MERGEABLE",
      state: "OPEN"
    },
    checks: [
      normalizeCheck({
        __typename: "CheckRun",
        name: "verify",
        status: "COMPLETED",
        conclusion: "SUCCESS"
      }),
      { name: "Database behavior", result: "SKIPPED" },
      normalizeCheck({ __typename: "StatusContext", context: "Vercel", state: "SUCCESS" }),
      { name: "Merge when green", result: "PENDING" }
    ],
    unresolvedThreads: 0,
    codexReview: { commitSha: "b".repeat(40), status: "running" },
    truncated: false
  };
  const mergesWith = (change: Partial<typeof green>, pr: Partial<typeof green.pr> = {}) =>
    decideMerge({ ...green, ...change, pr: { ...green.pr, ...pr } }).merge;

  assert.equal(decideMerge(green).merge, true);
  assert.equal(mergesWith({}, { labels: [] }), false);
  assert.equal(mergesWith({}, { isDraft: true }), false);
  assert.equal(mergesWith({}, { mergeable: "CONFLICTING" }), false);
  assert.equal(mergesWith({ checks: green.checks.slice(1) }), false);
  assert.equal(
    mergesWith({
      checks: [
        ...green.checks,
        normalizeCheck({
          __typename: "CheckRun",
          name: "lint",
          status: "IN_PROGRESS",
          conclusion: null
        })
      ]
    }),
    false
  );
  assert.equal(
    mergesWith({ checks: [...green.checks, { name: "e2e", result: "FAILURE" }] }),
    false
  );
  assert.equal(mergesWith({ unresolvedThreads: 1 }), false);
  assert.equal(mergesWith({ truncated: true }), false);
  assert.equal(mergesWith({ codexReview: { commitSha: head, status: "running" } }), false);

  const state = (status: string) =>
    `<!-- codex-review-state:v1 {"code_review":{"commit_sha":"${head}","status":"${status}"}} -->`;
  assert.deepEqual(
    readCodexReview([
      { user: { login: "chatgpt-codex-connector[bot]" }, body: state("running") },
      { user: { login: "someone-else" }, body: state("completed") }
    ]),
    { commitSha: head, status: "running" }
  );

  const workflow = source(".github/workflows/merge-when-green.yml");
  assert.match(workflow, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.match(workflow, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\.0\.1/);
});
