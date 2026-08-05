import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const schemaHealthUrl = new URL("../scripts/schema-health.mjs", import.meta.url);
const schemaHealthPath = fileURLToPath(schemaHealthUrl);
const repositoryRoot = dirname(dirname(schemaHealthPath));
const runbook = readFileSync(new URL("../docs/migration-release.md", import.meta.url), "utf8");
const contributing = readFileSync(new URL("../CONTRIBUTING.md", import.meta.url), "utf8");

function runWithFakeSupabase(
  args: string[],
  extraEnv: Record<string, string | undefined> = {}
) {
  const directory = mkdtempSync(join(tmpdir(), "pokenotes-schema-health-"));
  const executable = join(directory, "supabase");
  const argumentLog = join(directory, "arguments.jsonl");

  writeFileSync(
    executable,
    `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
appendFileSync(process.env.POKENOTES_TEST_ARGUMENT_LOG, JSON.stringify(process.argv.slice(2)) + "\\n");
process.stdout.write("[]\\n");
`
  );
  chmodSync(executable, 0o700);

  try {
    const result = spawnSync(process.execPath, [schemaHealthPath, ...args], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        ...extraEnv,
        PATH: `${directory}:${process.env.PATH ?? ""}`,
        POKENOTES_TEST_ARGUMENT_LOG: argumentLog
      }
    });
    const calls = readFileSync(argumentLog, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as string[]);

    return { result, calls };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("migration release path separates worker, rehearsal, and production authority", () => {
  assert.match(runbook, /Migration worker/);
  assert.match(runbook, /Release owner/);
  assert.match(runbook, /Independent reviewer/);
  assert.match(runbook, /Production operator/);
  assert.match(runbook, /Application release owner/);
  assert.match(runbook, /unlinked commit/);
  assert.match(runbook, /US\$1 total/);
  assert.match(runbook, /production migration before application/i);
  assert.match(runbook, /`supabase\/migrations\/` is the release authority/);
  assert.match(runbook, /legacy pre-push deployment as migration evidence/);
});

test("migration evidence gate covers security, failure, and verified cleanup", () => {
  assert.match(runbook, /ACL \/ RLS \/ ownership matrix/);
  assert.match(runbook, /Concurrency test/);
  assert.match(runbook, /Fault-injection rollback/);
  assert.match(runbook, /post-delete absence proof/);
  assert.match(runbook, /supabase branches delete "\$POKENOTES_BRANCH_ID"/);
  assert.match(runbook, /explicit reset approval/);
  assert.match(runbook, /confirmed\s+disposable local instance/);
  assert.match(runbook, /migration-before-application order/);
  assert.match(runbook, /NOT AUTHORIZED \/ NOT RUN/);
  assert.match(runbook, /--db-url-env POKENOTES_PRODUCTION_DATABASE_URL/);
  assert.doesNotMatch(runbook, /--project-ref </);
});

test("schema health keeps linked queries as its no-argument default", () => {
  const { result, calls } = runWithFakeSupabase([]);

  assert.equal(result.status, 1);
  assert.ok(calls.length > 0);
  for (const call of calls) {
    assert.ok(call.includes("--linked"));
    assert.ok(!call.includes("--db-url"));
  }
});

test("schema health selects only the database URL stored in the named environment variable", () => {
  const databaseUrl = "postgresql://synthetic.invalid/test";
  const { result, calls } = runWithFakeSupabase(
    ["--db-url-env", "POKENOTES_TEST_DATABASE_URL"],
    { POKENOTES_TEST_DATABASE_URL: databaseUrl }
  );

  assert.equal(result.status, 1);
  assert.ok(calls.length > 0);
  for (const call of calls) {
    const flagIndex = call.indexOf("--db-url");
    assert.ok(flagIndex >= 0);
    assert.equal(call[flagIndex + 1], databaseUrl);
    assert.ok(!call.includes("--linked"));
  }
  assert.doesNotMatch(runbook, /supabase link/);
});

test("schema health fails closed before invoking Supabase for invalid target configuration", () => {
  for (const args of [
    ["--unknown"],
    ["--db-url-env", "not_shell_safe"],
    ["--db-url-env", "POKENOTES_UNSET_DATABASE_URL"]
  ]) {
    const result = spawnSync(process.execPath, [schemaHealthPath, ...args], {
      cwd: repositoryRoot,
      encoding: "utf8"
    });

    assert.equal(result.status, 2);
  }
});

test("contributor guidance points migration authors to the release gate", () => {
  assert.match(contributing, /isolated migration release path/);
  assert.match(contributing, /docs\/migration-release\.md/);
});
