import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = fileURLToPath(
  new URL("../scripts/rehearse-local-migration.mjs", import.meta.url)
);

function command(cwd: string, executable: string, args: string[], env = process.env) {
  const isolatedEnvironment = { ...env };
  for (const name of Object.keys(isolatedEnvironment)) {
    if (name.startsWith("GIT_")) delete isolatedEnvironment[name];
  }
  return spawnSync(executable, args, { cwd, encoding: "utf8", env: isolatedEnvironment });
}

function createRepository() {
  const root = mkdtempSync(join(tmpdir(), "pokenotes-rehearsal-test-"));
  command(root, "git", ["init", "-q"]);
  command(root, "git", ["config", "user.email", "tests@pokenotes.local"]);
  command(root, "git", ["config", "user.name", "PokeNotes Tests"]);
  writeFileSync(join(root, "schema.sql"), "create table public.before_state(id uuid primary key);\n");
  command(root, "git", ["add", "schema.sql"]);
  command(root, "git", ["commit", "-qm", "baseline"]);
  const baseline = command(root, "git", ["rev-parse", "HEAD"]).stdout.trim();

  mkdirSync(join(root, "supabase", "migrations"), { recursive: true });
  writeFileSync(
    join(root, "supabase", "migrations", "20260919000000_add_after_state.sql"),
    "create table public.after_state(id uuid primary key);\n"
  );
  writeFileSync(join(root, "verify.sql"), "select 1;\n");
  command(root, "git", ["add", "."]);
  command(root, "git", ["commit", "-qm", "migration"]);
  return { root, baseline };
}

function fakeSupabase(root: string) {
  const bin = join(root, "bin");
  const log = join(root, "supabase-calls.jsonl");
  mkdirSync(bin);
  const executable = join(bin, "supabase");
  writeFileSync(
    executable,
    `#!/usr/bin/env node
const { appendFileSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const args = process.argv.slice(2);
appendFileSync(process.env.REHEARSAL_CALL_LOG, JSON.stringify(args) + "\\n");
if (args.includes("init")) {
  const workdir = args[args.indexOf("--workdir") + 1];
  mkdirSync(join(workdir, "supabase"), { recursive: true });
  writeFileSync(join(workdir, "supabase", "config.toml"), "port = 54321\\nport = 54322\\n");
}
if (args.includes("start")) {
  const workdir = args[args.indexOf("--workdir") + 1];
  const migration = readFileSync(
    join(workdir, "supabase", "migrations", "20260919000000_add_after_state.sql"),
    "utf8"
  );
  const verification = readFileSync(join(workdir, "supabase", "seed.sql"), "utf8");
  if (migration.includes("DIRTY_WORKTREE") || verification.includes("DIRTY_WORKTREE")) process.exit(9);
}
`
  );
  chmodSync(executable, 0o700);
  return { bin, log };
}

test("local rehearsal applies an exact Git range and always runs evidence plus cleanup", () => {
  const { root, baseline } = createRepository();
  const { bin, log } = fakeSupabase(root);
  try {
    writeFileSync(
      join(root, "supabase", "migrations", "20260919000000_add_after_state.sql"),
      "DIRTY_WORKTREE\n"
    );
    writeFileSync(join(root, "verify.sql"), "DIRTY_WORKTREE\n");
    const result = command(
      root,
      process.execPath,
      [
        scriptPath,
        "--from",
        baseline,
        "--through",
        "20260919000000",
        "--verify",
        "verify.sql"
      ],
      { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}`, REHEARSAL_CALL_LOG: log }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Pre-change source:/);
    assert.match(result.stdout, /20260919000000_add_after_state\.sql/);
    assert.match(result.stdout, /Local migration rehearsal passed/);
    assert.match(result.stdout, /containers and volumes removed/);

    const calls = readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as string[]);
    assert.ok(calls.some((args) => args.includes("start")));
    assert.ok(calls.some((args) => args.includes("reset") && args.includes("--local")));
    assert.ok(calls.some((args) => args.includes("list") && args.includes("--local")));
    assert.ok(
      calls.some(
        (args) =>
          args.includes("advisors") && args.includes("security") && args.includes("error")
      )
    );
    assert.ok(calls.some((args) => args.includes("stop") && args.includes("--no-backup")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("local rehearsal refuses a target migration outside the selected Git range", () => {
  const { root, baseline } = createRepository();
  const { bin, log } = fakeSupabase(root);
  try {
    const result = command(
      root,
      process.execPath,
      [scriptPath, "--from", baseline, "--through", "20260919000001"],
      { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}`, REHEARSAL_CALL_LOG: log }
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /refusing an ambiguous rehearsal/);
    assert.throws(() => readFileSync(log, "utf8"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("local rehearsal refuses focused SQL outside the repository", () => {
  const { root, baseline } = createRepository();
  try {
    const outside = join(dirname(root), "outside-rehearsal-check.sql");
    writeFileSync(outside, "select 1;\n");
    const result = command(root, process.execPath, [
      scriptPath,
      "--from",
      baseline,
      "--through",
      "20260919000000",
      "--verify",
      outside
    ]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /must resolve inside the repository/);
    rmSync(outside, { force: true });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
