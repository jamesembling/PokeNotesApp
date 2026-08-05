import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { prePushFileSets } from "../scripts/git-hook-files.mjs";

const ZERO_SHA = "0".repeat(40);
const HOOK_SCRIPT = fileURLToPath(new URL("../scripts/git-hooks.mjs", import.meta.url));

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function commit(cwd: string, message: string) {
  git(cwd, "add", "-A");
  git(cwd, "commit", "-m", message);
  return git(cwd, "rev-parse", "HEAD");
}

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "pokenotes-git-hook-"));
  git(cwd, "init", "-b", "main");
  git(cwd, "config", "user.name", "Hook Test");
  git(cwd, "config", "user.email", "hook-test@example.invalid");
  writeFileSync(join(cwd, "README.md"), "base\n");
  const base = commit(cwd, "base");

  mkdirSync(join(cwd, "sql"));
  writeFileSync(join(cwd, "sql/inherited.sql"), "select 'main';\n");
  const main = commit(cwd, "main SQL");
  git(cwd, "update-ref", "refs/remotes/origin/main", main);

  return { cwd, base, main };
}

function newBranchInput(localSha: string) {
  return `refs/heads/feature ${localSha} refs/heads/feature ${ZERO_SHA}\n`;
}

function runHook(cwd: string, input: string) {
  const fakeBin = join(cwd, "fake-bin");
  const commandLog = join(cwd, "hook-commands.log");
  mkdirSync(fakeBin);

  for (const command of ["npm", "node"]) {
    const path = join(fakeBin, command);
    writeFileSync(
      path,
      `#!/bin/sh\nprintf '${command}:%s\\n' "$*" >> "$HOOK_COMMAND_LOG"\n`
    );
    chmodSync(path, 0o755);
  }

  const stdout = execFileSync(process.execPath, [HOOK_SCRIPT, "pre-push"], {
    cwd,
    encoding: "utf8",
    input,
    env: {
      ...process.env,
      HOOK_COMMAND_LOG: commandLog,
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`
    }
  });

  return { stdout, commands: readFileSync(commandLog, "utf8") };
}

test("an existing branch push excludes unchanged SQL inherited by a rebase onto main", (t) => {
  const { cwd, base, main } = fixture();
  t.after(() => rmSync(cwd, { recursive: true, force: true }));

  git(cwd, "checkout", "-b", "remote-feature", base);
  writeFileSync(join(cwd, "feature.txt"), "old branch patch\n");
  const remoteSha = commit(cwd, "old branch patch");

  git(cwd, "checkout", "-b", "rebased-feature", main);
  writeFileSync(join(cwd, "feature.txt"), "old branch patch\n");
  const localSha = commit(cwd, "rebased branch patch");

  const result = prePushFileSets(
    `refs/heads/feature ${localSha} refs/heads/feature ${remoteSha}\n`,
    { cwd }
  );

  assert.deepEqual(result.pushedFiles, ["sql/inherited.sql"]);
  assert.deepEqual(result.branchOwnedFiles, ["feature.txt"]);
});

test("the pre-push hook does not deploy inherited SQL from an existing branch push", (t) => {
  const { cwd, base, main } = fixture();
  t.after(() => rmSync(cwd, { recursive: true, force: true }));

  git(cwd, "checkout", "-b", "remote-feature", base);
  writeFileSync(join(cwd, "feature.txt"), "same patch\n");
  const remoteSha = commit(cwd, "old branch patch");
  git(cwd, "checkout", "-b", "rebased-feature", main);
  writeFileSync(join(cwd, "feature.txt"), "same patch\n");
  const localSha = commit(cwd, "rebased branch patch");

  const { stdout, commands } = runHook(
    cwd,
    `refs/heads/feature ${localSha} refs/heads/feature ${remoteSha}\n`
  );

  assert.match(stdout, /Running pre-push quality gate/);
  assert.doesNotMatch(stdout, /SQL files changed/);
  assert.match(commands, /npm:run lint/);
  assert.match(commands, /npm:run typecheck/);
  assert.match(commands, /npm:run test/);
  assert.doesNotMatch(commands, /node:scripts\/deploy-changed-sql\.mjs/);
});

test("the pre-push hook still deploys modified branch-owned SQL", (t) => {
  const { cwd, main } = fixture();
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  git(cwd, "checkout", "-b", "feature", main);
  writeFileSync(join(cwd, "sql/inherited.sql"), "select 'branch modification';\n");
  const localSha = commit(cwd, "modify SQL");

  const { stdout, commands } = runHook(cwd, newBranchInput(localSha));

  assert.match(stdout, /SQL files changed/);
  assert.match(commands, /node:scripts\/deploy-changed-sql\.mjs sql\/inherited\.sql/);
});

test("new and modified branch-owned SQL remains protected", (t) => {
  const { cwd, main } = fixture();
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  git(cwd, "checkout", "-b", "feature", main);
  writeFileSync(join(cwd, "sql/inherited.sql"), "select 'branch modification';\n");
  writeFileSync(join(cwd, "sql/new.sql"), "select 'new branch SQL';\n");
  const localSha = commit(cwd, "change SQL");

  const result = prePushFileSets(newBranchInput(localSha), { cwd });

  assert.deepEqual(result.branchOwnedFiles, ["sql/inherited.sql", "sql/new.sql"]);
});

test("deleted branch-owned SQL remains protected", (t) => {
  const { cwd, main } = fixture();
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  git(cwd, "checkout", "-b", "feature", main);
  rmSync(join(cwd, "sql/inherited.sql"));
  const localSha = commit(cwd, "delete SQL");

  const result = prePushFileSets(newBranchInput(localSha), { cwd });

  assert.deepEqual(result.branchOwnedFiles, ["sql/inherited.sql"]);
});

test("renamed branch-owned SQL reports both sides so moves cannot evade protection", (t) => {
  const { cwd, main } = fixture();
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  git(cwd, "checkout", "-b", "feature", main);
  git(cwd, "mv", "sql/inherited.sql", "sql/renamed.sql");
  const localSha = commit(cwd, "rename SQL");

  const result = prePushFileSets(newBranchInput(localSha), { cwd });

  assert.deepEqual(result.branchOwnedFiles, ["sql/inherited.sql", "sql/renamed.sql"]);
});

test("missing target ancestry fails closed instead of silently skipping SQL", (t) => {
  const { cwd, main } = fixture();
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  git(cwd, "update-ref", "-d", "refs/remotes/origin/main");

  assert.throws(
    () => prePushFileSets(newBranchInput(main), { cwd }),
    /merge-base .* origin\/main failed/
  );
});
