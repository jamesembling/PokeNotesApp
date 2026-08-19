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
const productionWorkflow = readFileSync(
  new URL("../.github/workflows/deploy-production-database.yml", import.meta.url),
  "utf8"
);

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
if (process.env.POKENOTES_TEST_CHILD_STDOUT_REPLACE) {
  process.stdout.write(process.env.POKENOTES_TEST_CHILD_STDOUT_REPLACE + "\\n");
} else {
  process.stdout.write("[]\\n");
}
if (process.env.POKENOTES_TEST_CHILD_STDOUT && !process.env.POKENOTES_TEST_CHILD_STDOUT_REPLACE) {
  process.stdout.write(process.env.POKENOTES_TEST_CHILD_STDOUT + "\\n");
}
if (process.env.POKENOTES_TEST_CHILD_STDERR) {
  process.stderr.write(process.env.POKENOTES_TEST_CHILD_STDERR + "\\n");
}
if (process.env.POKENOTES_TEST_CHILD_EXIT) {
  process.exit(Number(process.env.POKENOTES_TEST_CHILD_EXIT));
}
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
  liveBranchRef = "abcdefghijklmnopqrst",
  childOutput = false,
  childFailure = false,
  branchParseError = false
}: {
  apply?: boolean;
  databaseUrl?: string;
  parentProjectRef?: string;
  liveBranchId?: string;
  liveBranchRef?: string;
  childOutput?: boolean;
  childFailure?: boolean;
  branchParseError?: boolean;
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
  if (process.env.POKENOTES_TEST_BRANCH_PARSE_ERROR) {
    process.stdout.write("invalid " + process.env.POKENOTES_DISPOSABLE_DATABASE_URL +
      " password=" + process.env.POKENOTES_TEST_DATABASE_PASSWORD + "\\n");
  } else {
    process.stdout.write(JSON.stringify({
      id: process.env.POKENOTES_TEST_LIVE_BRANCH_ID,
      project_ref: process.env.POKENOTES_TEST_LIVE_BRANCH_REF
    }) + "\\n");
  }
}
if (process.env.POKENOTES_TEST_CHILD_OUTPUT && args.includes("push")) {
  process.stdout.write("child stdout " + args.join(" ") + "\\n");
  process.stderr.write("child stderr password=" +
    process.env.POKENOTES_TEST_DATABASE_PASSWORD + " url=" +
    process.env.POKENOTES_DISPOSABLE_DATABASE_URL + "\\n");
}
if (process.env.POKENOTES_TEST_CHILD_FAILURE && args.includes("push")) {
  process.exit(9);
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
        env: testEnvironment({
          PATH: `${directory}:${process.env.PATH ?? ""}`,
          POKENOTES_TEST_ARGUMENT_LOG: argumentLog,
          POKENOTES_TEST_LIVE_BRANCH_ID: liveBranchId,
          POKENOTES_TEST_LIVE_BRANCH_REF: liveBranchRef,
          POKENOTES_TEST_CHILD_OUTPUT: childOutput ? "1" : undefined,
          POKENOTES_TEST_CHILD_FAILURE: childFailure ? "1" : undefined,
          POKENOTES_TEST_BRANCH_PARSE_ERROR: branchParseError ? "1" : undefined,
          POKENOTES_TEST_DATABASE_PASSWORD: "synthetic-secret",
          POKENOTES_PARENT_PROJECT_REF: parentProjectRef,
          POKENOTES_BRANCH_ID: "branch-12345678",
          POKENOTES_BRANCH_REF: "abcdefghijklmnopqrst",
          POKENOTES_DISPOSABLE_DATABASE_URL: databaseUrl
        })
      }
    );
    const calls = readArgumentCalls(argumentLog);

    return { result, calls };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("migration release path gives production authority only to the controlled workflow", () => {
  assert.match(
    runbook,
    /`supabase\/migrations\/` and Supabase's migration history are the release authority/
  );
  assert.match(runbook, /Git hooks validate migrations/);
  assert.match(runbook, /manually dispatched \*\*Deploy production database\*\*/);
  assert.match(runbook, /workflow is the only production migration path/i);
  assert.match(runbook, /expand-and-contract/);
});

test("production workflow is manual, serialized, main-only, and verifies the live result", () => {
  assert.match(productionWorkflow, /^  workflow_dispatch:/m);
  assert.doesNotMatch(productionWorkflow, /^  push:/m);
  assert.match(productionWorkflow, /group: production-database/);
  assert.match(productionWorkflow, /cancel-in-progress: false/);
  assert.match(productionWorkflow, /environment: Production/);
  assert.match(productionWorkflow, /refs\/heads\/main/);
  assert.match(productionWorkflow, /CONFIRMATION" != "DEPLOY"/);
  assert.match(productionWorkflow, /version: 2\.115\.0/);
  assert.match(productionWorkflow, /supabase db push[^\n]+--dry-run/);
  assert.match(productionWorkflow, /supabase migration list/);
  assert.match(productionWorkflow, /schema:health/);
  assert.match(productionWorkflow, /db advisors[^\n]+--type security --fail-on error/);
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
  assert.deepEqual(calls, []);
  assert.match(result.stderr, /not bound to the frozen approved branch ref/);
});

test("disposable rehearsal rejects a direct URL host override before db push", () => {
  const databaseUrl =
    "postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres" +
    "?host=db.zyxwvutsrqponmlkjihg.supabase.co";
  const { result, calls } = runRehearsal({ databaseUrl });

  assert.equal(result.status, 1);
  assert.deepEqual(calls, []);
  assert.match(result.stderr, /query parameter that could alter the approved target/);
  assert.doesNotMatch(result.stderr, /secret/);
});

test("disposable rehearsal rejects a pooler service override before db push", () => {
  const databaseUrl =
    "postgresql://postgres.abcdefghijklmnopqrst:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres" +
    "?service=production";
  const { result, calls } = runRehearsal({ databaseUrl });

  assert.equal(result.status, 1);
  assert.deepEqual(calls, []);
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

test("disposable rehearsal rejects missing and invalid database URLs before Supabase", () => {
  for (const databaseUrl of [
    undefined,
    "not a URL",
    "https://db.abcdefghijklmnopqrst.supabase.co/postgres",
    "postgresql://postgres:synthetic-secret@example.invalid/postgres"
  ]) {
    const { result, calls } = runRehearsal({ databaseUrl });

    assert.equal(result.status, 1);
    assert.deepEqual(calls, []);
    assert.doesNotMatch(result.stderr, /synthetic-secret/);
  }
});

test("disposable rehearsal redacts database credentials from successful child output", () => {
  const databaseUrl =
    "postgresql://postgres:synthetic-secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres";
  const { result } = runRehearsal({ databaseUrl, childOutput: true });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /child stdout/);
  assert.match(result.stderr, /child stderr/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /synthetic-secret/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /postgresql:\/\//);
  assert.match(`${result.stdout}\n${result.stderr}`, /\[REDACTED\]/);
});

test("disposable rehearsal redacts database credentials from failed child output", () => {
  const databaseUrl =
    "postgresql://postgres:synthetic-secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres";
  const { result } = runRehearsal({ databaseUrl, childOutput: true, childFailure: true });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Disposable migration dry run failed/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /synthetic-secret/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /postgresql:\/\//);
});

test("disposable rehearsal does not expose database credentials on branch parse errors", () => {
  const databaseUrl =
    "postgresql://postgres:synthetic-secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres";
  const { result } = runRehearsal({ databaseUrl, branchParseError: true });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /branch details were not valid JSON/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /synthetic-secret/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /postgresql:\/\//);
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

test("schema health redacts database credentials from successful child stderr", () => {
  const databaseUrl =
    "postgresql://postgres:synthetic-secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres";
  const { result } = runWithFakeSupabase(
    ["--db-url-env", "POKENOTES_TEST_DATABASE_URL"],
    {
      POKENOTES_TEST_DATABASE_URL: databaseUrl,
      POKENOTES_TEST_CHILD_STDERR: `child stderr ${databaseUrl} synthetic-secret`
    }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /child stderr/);
  assert.doesNotMatch(result.stderr, /synthetic-secret/);
  assert.doesNotMatch(result.stderr, /postgresql:\/\//);
});

test("schema health redacts database credentials from failed child output", () => {
  const databaseUrl =
    "postgresql://postgres:synthetic-secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres";
  const { result } = runWithFakeSupabase(
    ["--db-url-env", "POKENOTES_TEST_DATABASE_URL"],
    {
      POKENOTES_TEST_DATABASE_URL: databaseUrl,
      POKENOTES_TEST_CHILD_STDOUT: `child stdout ${databaseUrl}`,
      POKENOTES_TEST_CHILD_STDERR: "child stderr synthetic-secret",
      POKENOTES_TEST_CHILD_EXIT: "9"
    }
  );

  assert.equal(result.status, 1);
  assert.match(result.stdout, /child stdout/);
  assert.match(result.stderr, /child stderr/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /synthetic-secret/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /postgresql:\/\//);
});

test("schema health redacts database credentials from parse errors", () => {
  const databaseUrl =
    "postgresql://postgres:synthetic-secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres";
  const { result } = runWithFakeSupabase(
    ["--db-url-env", "POKENOTES_TEST_DATABASE_URL"],
    {
      POKENOTES_TEST_DATABASE_URL: databaseUrl,
      POKENOTES_TEST_CHILD_STDOUT_REPLACE:
        `[invalid ${databaseUrl} synthetic-secret]`
    }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Could not parse Supabase JSON output/);
  assert.doesNotMatch(result.stderr, /synthetic-secret/);
  assert.doesNotMatch(result.stderr, /postgresql:\/\//);
  assert.match(result.stderr, /\[REDACTED\]/);
});

test("schema health redacts normalized query credentials without the original URL", () => {
  const databaseUrl =
    "postgresql://db.example.invalid/postgres?user=synthetic-user&" +
    "password=synthetic%2Dquery%2Dsecret&sslpassword=synthetic-tls-secret";
  const { result } = runWithFakeSupabase(
    ["--db-url-env", "POKENOTES_TEST_DATABASE_URL"],
    {
      POKENOTES_TEST_DATABASE_URL: databaseUrl,
      POKENOTES_TEST_CHILD_STDOUT: "password=synthetic-query-secret",
      POKENOTES_TEST_CHILD_STDERR:
        "user=synthetic-user sslpassword=synthetic-tls-secret",
      POKENOTES_TEST_CHILD_EXIT: "9"
    }
  );

  assert.equal(result.status, 1);
  assert.match(`${result.stdout}\n${result.stderr}`, /password=\[REDACTED\]/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /synthetic-query-secret/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /synthetic-user/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /synthetic-tls-secret/);
});

test("contributor guidance points migration authors to the release gate", () => {
  assert.match(
    contributing,
    /hooks[\s\S]*do not connect to or mutate the\s+production database/
  );
  assert.match(contributing, /docs\/migration-release\.md/);
  assert.match(contributing, /manually dispatched production workflow/);
});
