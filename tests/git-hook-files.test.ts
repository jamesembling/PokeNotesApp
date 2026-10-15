import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { prePushFileSets, remoteMainSha } from "../scripts/git-hook-files.mjs";

const ZERO_SHA = "0".repeat(40);
const HOOK_SCRIPT = fileURLToPath(new URL("../scripts/git-hooks.mjs", import.meta.url));
const HOOK_WRAPPER = fileURLToPath(new URL("../.githooks/pre-push", import.meta.url));
const HOOK_FILES = fileURLToPath(new URL("../scripts/git-hook-files.mjs", import.meta.url));
const GIT_LOCAL_ENV_VARS = execFileSync("git", ["rev-parse", "--local-env-vars"], {
  encoding: "utf8"
})
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);

for (const variable of GIT_LOCAL_ENV_VARS) {
  delete process.env[variable];
}

function isolatedGitEnv(overrides: Record<string, string | undefined> = {}) {
  const env = { ...process.env };
  for (const variable of GIT_LOCAL_ENV_VARS) {
    delete env[variable];
  }
  return { ...env, ...overrides };
}

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: isolatedGitEnv() }).trim();
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

function runHook(cwd: string, input: string, failScript?: string) {
  const fakeBin = join(cwd, "fake-bin");
  const commandLog = join(cwd, "hook-commands.log");
  mkdirSync(fakeBin, { recursive: true });
  writeFileSync(commandLog, "");

  for (const command of ["npm", "node"]) {
    const path = join(fakeBin, command);
    writeFileSync(
      path,
      `#!/bin/sh\nprintf '${command}:%s\\n' "$*" >> "$HOOK_COMMAND_LOG"\nif [ "$2" = "$HOOK_FAIL_SCRIPT" ]; then exit 23; fi\n`
    );
    chmodSync(path, 0o755);
  }

  const result = spawnSync(process.execPath, [HOOK_SCRIPT, "pre-push", "."], {
    cwd,
    encoding: "utf8",
    input,
    env: isolatedGitEnv({
      HOOK_COMMAND_LOG: commandLog,
      HOOK_FAIL_SCRIPT: failScript ?? "",
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`
    })
  });

  assert.equal(result.status, failScript ? 23 : 0, `${result.stdout}${result.stderr}`);
  return { stdout: result.stdout, commands: readFileSync(commandLog, "utf8") };
}

function installPrePushHook(cwd: string) {
  const hooksDir = join(cwd, ".githooks");
  const scriptsDir = join(cwd, "scripts");
  mkdirSync(hooksDir);
  mkdirSync(scriptsDir);
  copyFileSync(HOOK_WRAPPER, join(hooksDir, "pre-push"));
  copyFileSync(HOOK_SCRIPT, join(scriptsDir, "git-hooks.mjs"));
  copyFileSync(HOOK_FILES, join(scriptsDir, "git-hook-files.mjs"));
  chmodSync(join(hooksDir, "pre-push"), 0o755);
  git(cwd, "config", "core.hooksPath", ".githooks");
}

function bareRemote(parent: string, name: string) {
  const path = join(parent, name);
  git(parent, "init", "--bare", path);
  return path;
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
    { cwd, targetMainSha: main }
  );

  assert.deepEqual(result.pushedFiles, ["sql/inherited.sql"]);
});

test("the pre-push quality gate audits design first and never deploys inherited SQL", (t) => {
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
  assert.deepEqual(commands.trim().split("\n"), [
    "npm:run design:audit --",
    "npm:run lint --",
    "npm:run typecheck --",
    "npm:run test --"
  ]);
  assert.doesNotMatch(commands, /node:scripts\/deploy-changed-sql\.mjs/);

  const failed = runHook(
    cwd,
    `refs/heads/feature ${localSha} refs/heads/feature ${remoteSha}\n`,
    "design:audit"
  );
  assert.equal(failed.commands, "npm:run design:audit --\n");
});

test("the pre-push hook validates modified SQL without deploying it", (t) => {
  const { cwd, main } = fixture();
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  git(cwd, "checkout", "-b", "feature", main);
  writeFileSync(join(cwd, "sql/inherited.sql"), "select 'branch modification';\n");
  const localSha = commit(cwd, "modify SQL");

  const { stdout, commands } = runHook(cwd, newBranchInput(localSha));

  assert.doesNotMatch(stdout, /SQL files changed/);
  assert.match(commands, /npm:run lint/);
  assert.match(commands, /npm:run typecheck/);
  assert.match(commands, /npm:run test/);
  assert.doesNotMatch(commands, /deploy-changed-sql/);
});

test("a stale-ahead origin/main cannot hide SQL absent from the actual remote main", (t) => {
  const { cwd, base } = fixture();
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  git(cwd, "checkout", "-b", "feature", base);
  git(cwd, "update-ref", "refs/heads/main", base);
  mkdirSync(join(cwd, "sql"));
  writeFileSync(join(cwd, "sql/branch.sql"), "select 'branch SQL';\n");
  const sqlCommit = commit(cwd, "branch SQL");
  writeFileSync(join(cwd, "feature.txt"), "feature\n");
  const localSha = commit(cwd, "feature");
  git(cwd, "update-ref", "refs/remotes/origin/main", sqlCommit);

  const actualRemoteMain = remoteMainSha(".", { cwd });
  const result = prePushFileSets(newBranchInput(localSha), {
    cwd,
    targetMainSha: actualRemoteMain
  });

  assert.equal(actualRemoteMain, base);
  assert.deepEqual(result.pushedFiles, ["feature.txt", "sql/branch.sql"]);

  const { stdout, commands } = runHook(cwd, newBranchInput(localSha));
  assert.doesNotMatch(stdout, /SQL files changed/);
  assert.doesNotMatch(commands, /deploy-changed-sql/);
});

test("the pre-push wrapper classifies SQL against the actual push location", (t) => {
  const { cwd, base, main } = fixture();
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const remoteParent = mkdtempSync(join(tmpdir(), "pokenotes-git-hook-remotes-"));
  t.after(() => rmSync(remoteParent, { recursive: true, force: true }));
  const fetchRemote = bareRemote(remoteParent, "fetch.git");
  const pushRemote = bareRemote(remoteParent, "push.git");
  git(cwd, "remote", "add", "publish", fetchRemote);
  git(cwd, "push", "--no-verify", "publish", `${main}:refs/heads/main`);
  git(cwd, "push", "--no-verify", pushRemote, `${base}:refs/heads/main`);
  git(cwd, "remote", "set-url", "--push", "publish", pushRemote);
  assert.equal(git(cwd, "--git-dir", fetchRemote, "rev-parse", "refs/heads/main"), main);
  assert.equal(git(cwd, "--git-dir", pushRemote, "rev-parse", "refs/heads/main"), base);

  git(cwd, "checkout", "-b", "feature", base);
  mkdirSync(join(cwd, "sql"), { recursive: true });
  writeFileSync(join(cwd, "sql/branch.sql"), "select 'branch SQL';\n");
  const localSha = commit(cwd, "branch SQL");
  installPrePushHook(cwd);

  const fakeBin = join(cwd, "fake-bin");
  const commandLog = join(cwd, "hook-commands.log");
  mkdirSync(fakeBin);
  writeFileSync(commandLog, "");
  writeFileSync(
    join(fakeBin, "npm"),
    "#!/bin/sh\nprintf 'npm:%s\\n' \"$*\" >> \"$HOOK_COMMAND_LOG\"\n"
  );
  writeFileSync(
    join(fakeBin, "node"),
    "#!/bin/sh\nif [ \"$1\" = scripts/git-hooks.mjs ]; then exec \"$REAL_NODE\" \"$@\"; fi\nprintf 'node:%s\\n' \"$*\" >> \"$HOOK_COMMAND_LOG\"\n"
  );
  chmodSync(join(fakeBin, "npm"), 0o755);
  chmodSync(join(fakeBin, "node"), 0o755);

  const push = spawnSync("git", ["push", "publish", "feature:feature"], {
    cwd,
    encoding: "utf8",
    env: isolatedGitEnv({
      HOOK_COMMAND_LOG: commandLog,
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      REAL_NODE: process.execPath
    })
  });
  const output = `${push.stdout}${push.stderr}`;
  const commands = readFileSync(commandLog, "utf8");

  assert.equal(push.status, 0, output);
  assert.equal(git(cwd, "--git-dir", pushRemote, "rev-parse", "refs/heads/feature"), localSha);
  assert.doesNotMatch(output, /SQL files changed/);
  assert.doesNotMatch(commands, /deploy-changed-sql/);
});

test("manual pre-push compares broad gates with the explicit destination instead of upstream", (t) => {
  const { cwd, base } = fixture();
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const remoteParent = mkdtempSync(join(tmpdir(), "pokenotes-git-hook-remotes-"));
  t.after(() => rmSync(remoteParent, { recursive: true, force: true }));
  const upstreamRemote = bareRemote(remoteParent, "upstream.git");
  const destinationRemote = bareRemote(remoteParent, "destination.git");
  git(cwd, "push", "--no-verify", upstreamRemote, `${base}:refs/heads/main`);
  git(cwd, "push", "--no-verify", destinationRemote, `${base}:refs/heads/main`);

  git(cwd, "checkout", "-b", "feature", base);
  mkdirSync(join(cwd, "app/x"), { recursive: true });
  writeFileSync(join(cwd, "app/x/page.tsx"), "export default function Page() { return null; }\n");
  const localSha = commit(cwd, "feature page");
  git(cwd, "remote", "add", "upstream", upstreamRemote);
  git(cwd, "push", "--no-verify", "--set-upstream", "upstream", "feature");
  assert.equal(git(cwd, "rev-parse", "@{u}"), localSha);
  const destinationFeature = spawnSync(
    "git",
    ["--git-dir", destinationRemote, "show-ref", "--verify", "--quiet", "refs/heads/feature"],
    { encoding: "utf8", env: isolatedGitEnv() }
  );
  assert.equal(destinationFeature.status, 1);

  const fakeBin = join(cwd, "fake-bin");
  const commandLog = join(cwd, "hook-commands.log");
  mkdirSync(fakeBin);
  writeFileSync(commandLog, "");
  writeFileSync(
    join(fakeBin, "npm"),
    "#!/bin/sh\nprintf 'npm:%s\\n' \"$*\" >> \"$HOOK_COMMAND_LOG\"\n"
  );
  chmodSync(join(fakeBin, "npm"), 0o755);

  const result = spawnSync(
    process.execPath,
    [HOOK_SCRIPT, "pre-push", destinationRemote],
    {
      cwd,
      encoding: "utf8",
      input: "",
      env: isolatedGitEnv({
        HOOK_COMMAND_LOG: commandLog,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`
      })
    }
  );
  const output = `${result.stdout}${result.stderr}`;
  const commands = readFileSync(commandLog, "utf8");

  assert.equal(result.status, 0, output);
  assert.match(output, /Running pre-push quality gate/);
  assert.match(output, /Build-sensitive files changed/);
  assert.match(commands, /npm:run lint/);
  assert.match(commands, /npm:run typecheck/);
  assert.match(commands, /npm:run test/);
  assert.match(commands, /npm:run build/);
});

test("manual pre-push invocation requires an explicit push destination", () => {
  const result = spawnSync(process.execPath, [HOOK_SCRIPT, "pre-push"], {
    encoding: "utf8",
    input: ""
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /manual check run npm run hooks:pre-push -- <push-location>/);
});

test("an unavailable remote main fails closed instead of using origin/main", (t) => {
  const { cwd } = fixture();
  t.after(() => rmSync(cwd, { recursive: true, force: true }));

  assert.throws(
    () => remoteMainSha("missing-remote", { cwd }),
    /git ls-remote --exit-code missing-remote refs\/heads\/main failed/
  );
});
