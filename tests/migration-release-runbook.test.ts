import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const schemaHealthUrl = new URL("../scripts/schema-health.mjs", import.meta.url);
const schemaHealthPath = fileURLToPath(schemaHealthUrl);
const repositoryRoot = dirname(dirname(schemaHealthPath));
const rehearsalPath = join(repositoryRoot, "scripts/rehearse-migrations.mjs");
const runbook = readFileSync(new URL("../docs/migration-release.md", import.meta.url), "utf8");
const contributing = readFileSync(new URL("../CONTRIBUTING.md", import.meta.url), "utf8");

function readArgumentCalls(argumentLog: string) {
  if (!existsSync(argumentLog)) return [];

  return readFileSync(argumentLog, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as string[]);
}

function testEnvironment(extraEnv: Record<string, string | undefined>) {
  const environment: NodeJS.ProcessEnv = { ...process.env };
  for (const [name, value] of Object.entries(extraEnv)) {
    if (value === undefined) {
      delete environment[name];
    } else {
      environment[name] = value;
    }
  }
  return environment;
}

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
      env: testEnvironment({
        ...extraEnv,
        PATH: `${directory}:${process.env.PATH ?? ""}`,
        POKENOTES_TEST_ARGUMENT_LOG: argumentLog
      })
    });
    const calls = readArgumentCalls(argumentLog);

    return { result, calls };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function runRehearsal({
  apply = false,
  databaseUrl,
  parentProjectRef = "zyxwvutsrqponmlkjihg",
  liveBranchId = "branch-12345678",
  liveBranchRef = "abcdefghijklmnopqrst"
}: {
  apply?: boolean;
  databaseUrl: string;
  parentProjectRef?: string;
  liveBranchId?: string;
  liveBranchRef?: string;
}) {
  const directory = mkdtempSync(join(tmpdir(), "pokenotes-migration-rehearsal-"));
  const executable = join(directory, "supabase");
  const argumentLog = join(directory, "arguments.jsonl");

  writeFileSync(
    executable,
    `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
const args = process.argv.slice(2);
appendFileSync(process.env.POKENOTES_TEST_ARGUMENT_LOG, JSON.stringify(args) + "\\n");
if (args.includes("branches") && args.includes("get")) {
  process.stdout.write(JSON.stringify({
    id: process.env.POKENOTES_TEST_LIVE_BRANCH_ID,
    project_ref: process.env.POKENOTES_TEST_LIVE_BRANCH_REF
  }) + "\\n");
}
`
  );
  chmodSync(executable, 0o700);

  try {
    const result = spawnSync(
      process.execPath,
      [rehearsalPath, ...(apply ? ["--apply"] : [])],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH ?? ""}`,
          POKENOTES_TEST_ARGUMENT_LOG: argumentLog,
          POKENOTES_TEST_LIVE_BRANCH_ID: liveBranchId,
          POKENOTES_TEST_LIVE_BRANCH_REF: liveBranchRef,
          POKENOTES_PARENT_PROJECT_REF: parentProjectRef,
          POKENOTES_BRANCH_ID: "branch-12345678",
          POKENOTES_BRANCH_REF: "abcdefghijklmnopqrst",
          POKENOTES_DISPOSABLE_DATABASE_URL: databaseUrl
        }
      }
    );
    const calls = readArgumentCalls(argumentLog);

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
  assert.match(runbook, /only disposable `db push` path/);
  assert.match(runbook, /Never\s+bypass it with a raw disposable `db push`/);
  assert.doesNotMatch(runbook, /--project-ref </);
});

test("disposable rehearsal binds the live branch ref to the direct database URL before dry run", () => {
  const databaseUrl =
    "postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres";
  const { result, calls } = runRehearsal({ databaseUrl });

  assert.equal(result.status, 0);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].slice(1), [
    "branches",
    "get",
    "branch-12345678",
    "--project-ref",
    "zyxwvutsrqponmlkjihg",
    "-o",
    "json"
  ]);
  assert.ok(calls[1].includes("--dry-run"));
  assert.ok(calls[1].includes(databaseUrl));
});

test("disposable rehearsal fails before db push when a stale URL targets another project", () => {
  const databaseUrl =
    "postgresql://postgres:secret@db.bcdefghijklmnopqrstu.supabase.co:5432/postgres";
  const { result, calls } = runRehearsal({ databaseUrl });

  assert.equal(result.status, 1);
  assert.equal(calls.length, 1);
  assert.match(result.stderr, /not bound to the frozen approved branch ref/);
});

test("disposable rehearsal rejects a direct URL host override before db push", () => {
  const databaseUrl =
    "postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres" +
    "?host=db.zyxwvutsrqponmlkjihg.supabase.co";
  const { result, calls } = runRehearsal({ databaseUrl });

  assert.equal(result.status, 1);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes("branches"));
  assert.ok(!calls.some((call) => call.includes("push")));
  assert.match(result.stderr, /query parameter that could alter the approved target/);
  assert.doesNotMatch(result.stderr, /secret/);
});

test("disposable rehearsal rejects a pooler service override before db push", () => {
  const databaseUrl =
    "postgresql://postgres.abcdefghijklmnopqrst:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres" +
    "?service=production";
  const { result, calls } = runRehearsal({ databaseUrl });

  assert.equal(result.status, 1);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes("branches"));
  assert.ok(!calls.some((call) => call.includes("push")));
  assert.match(result.stderr, /query parameter that could alter the approved target/);
  assert.doesNotMatch(result.stderr, /secret/);
});

test("disposable rehearsal allows strict TLS mode without weakening target binding", () => {
  const databaseUrl =
    "postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres" +
    "?sslmode=verify-full";
  const { result, calls } = runRehearsal({ databaseUrl });

  assert.equal(result.status, 0);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].includes("--dry-run"));
});

test("disposable apply repeats verified dry run before the mutating push", () => {
  const databaseUrl =
    "postgresql://postgres.abcdefghijklmnopqrst:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres";
  const { result, calls } = runRehearsal({ apply: true, databaseUrl });

  assert.equal(result.status, 0);
  assert.equal(calls.length, 4);
  assert.ok(calls[1].includes("--dry-run"));
  assert.ok(calls[2].includes("branches"));
  assert.ok(calls[2].includes("get"));
  assert.ok(!calls[3].includes("--dry-run"));
  assert.ok(calls[3].includes(databaseUrl));
});

test("disposable rehearsal rejects changed live branch identity before db push", () => {
  const databaseUrl =
    "postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres";
  const { result, calls } = runRehearsal({
    databaseUrl,
    liveBranchRef: "bcdefghijklmnopqrstu"
  });

  assert.equal(result.status, 1);
  assert.equal(calls.length, 1);
  assert.match(result.stderr, /does not match the frozen approved record/);
});

test("disposable rehearsal rejects changed live branch ID before db push", () => {
  const databaseUrl =
    "postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres";
  const { result, calls } = runRehearsal({
    databaseUrl,
    liveBranchId: "branch-87654321"
  });

  assert.equal(result.status, 1);
  assert.equal(calls.length, 1);
  assert.match(result.stderr, /does not match the frozen approved record/);
});

test("disposable rehearsal rejects a parent project ref as the disposable branch before Supabase", () => {
  const databaseUrl =
    "postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres";
  const { result, calls } = runRehearsal({
    databaseUrl,
    parentProjectRef: "abcdefghijklmnopqrst"
  });

  assert.equal(result.status, 1);
  assert.deepEqual(calls, []);
  assert.match(result.stderr, /must differ from POKENOTES_PARENT_PROJECT_REF/);
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
    const { result, calls } = runWithFakeSupabase(args, {
      POKENOTES_UNSET_DATABASE_URL: undefined
    });

    assert.equal(result.status, 2);
    assert.deepEqual(calls, []);
  }
});

test("contributor guidance points migration authors to the release gate", () => {
  assert.match(contributing, /isolated migration release path/);
  assert.match(contributing, /docs\/migration-release\.md/);
});
