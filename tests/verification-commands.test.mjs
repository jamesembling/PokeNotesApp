import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const referenceUrl = new URL("../docs/verification-commands.md", import.meta.url);
const reference = await readFile(referenceUrl, "utf8");

function zshIsAvailable({ error, status }) {
  if (error) {
    assert.equal(error.code, "ENOENT", `zsh probe failed unexpectedly: ${error.message}`);
    assert.equal(status, null, "a missing zsh executable must not report a process exit status");
    return false;
  }

  assert.equal(status, 0, `zsh availability probe exited with status ${status}`);
  return true;
}

test("verification reference keeps repository-native shell-safe command contracts", () => {
  const requiredContracts = [
    "npm run test -- tests/app-url.test.ts",
    "node --import tsx --test --test-name-pattern='falls back' tests/app-url.test.ts",
    "./node_modules/.bin/agent-browser --help | rg -- '--session|--state'",
    "download_http_status=",
    "--output \"$download_file\" --write-out '%{http_code}'",
    "gh pr create --help | rg -- '--body-file'",
    "gh pr create --draft --base main --title 'Reviewed title' --body-file \"$pr_body_file\"",
    "pokenotes_vercel_cli='./node_modules/.bin/vercel'",
    "env -i PATH=\"$PATH\" GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null git",
    "if ! git diff --quiet -- next-env.d.ts || ! git diff --cached --quiet -- next-env.d.ts; then",
    "git diff --cached --check",
  ];

  for (const contract of requiredContracts) {
    assert.ok(reference.includes(contract), `missing verification contract: ${contract}`);
  }

  assert.doesNotMatch(reference, /^\s*npx\s+vercel(?:\s|$)/m);
  assert.doesNotMatch(reference, /^\s*curl[^\n]*\|[^\n]*(?:head|sed\s+-n)(?:\s|$)/m);
});

test("typecheck failure restores known-clean next-env before returning the failure", async (t) => {
  const zshProbe = spawnSync("zsh", ["-c", "exit 0"], { encoding: "utf8" });
  if (!zshIsAvailable(zshProbe)) {
    t.skip("zsh is not installed; dynamic zsh proof requires a supported environment");
    return;
  }

  const fixtureRoot = await mkdtemp(join(tmpdir(), "pokenotes-verification-commands-"));
  const fixtureRepo = join(fixtureRoot, "repo");
  const fixtureBin = join(fixtureRoot, "bin");
  const cleanEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
  );
  const runGit = (...args) =>
    spawnSync("git", args, {
      cwd: fixtureRepo,
      encoding: "utf8",
      env: {
        ...cleanEnvironment,
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_NOSYSTEM: "1",
      },
    });

  t.after(() => rm(fixtureRoot, { force: true, recursive: true }));
  await mkdir(fixtureRepo);
  await mkdir(fixtureBin);
  assert.equal(runGit("init", "--quiet").status, 0);
  assert.equal(runGit("config", "user.name", "PokeNotes fixture").status, 0);
  assert.equal(runGit("config", "user.email", "fixture@example.invalid").status, 0);
  await writeFile(join(fixtureRepo, "next-env.d.ts"), "original\n");
  assert.equal(runGit("add", "next-env.d.ts").status, 0);
  assert.equal(runGit("commit", "--quiet", "-m", "fixture").status, 0);

  const fakeNpm = join(fixtureBin, "npm");
  await writeFile(fakeNpm, "#!/bin/sh\nprintf 'generated\\n' > next-env.d.ts\nexit 23\n");
  await chmod(fakeNpm, 0o700);

  const typecheckBlock = reference.match(
    /```zsh\n(if ! git diff --quiet -- next-env\.d\.ts[\s\S]*?)\n```/,
  )?.[1];
  assert.ok(typecheckBlock, "missing executable typecheck cleanup block");

  const result = spawnSync("zsh", ["-ec", typecheckBlock], {
    cwd: fixtureRepo,
    encoding: "utf8",
    env: { ...cleanEnvironment, PATH: `${fixtureBin}:${cleanEnvironment.PATH}` },
  });

  assert.equal(result.status, 23, result.stderr);
  assert.equal(await readFile(join(fixtureRepo, "next-env.d.ts"), "utf8"), "original\n");
  assert.equal(runGit("status", "--short").stdout, "");
});

test("zsh availability guard distinguishes a missing shell from failed proof", () => {
  const missingShellError = Object.assign(new Error("spawnSync zsh ENOENT"), { code: "ENOENT" });
  assert.equal(zshIsAvailable({ error: missingShellError, status: null }), false);

  const unexpectedShellError = Object.assign(new Error("spawnSync zsh EACCES"), { code: "EACCES" });
  assert.throws(
    () => zshIsAvailable({ error: unexpectedShellError, status: null }),
    /zsh probe failed unexpectedly/,
  );
  assert.throws(
    () => zshIsAvailable({ error: undefined, status: null }),
    /zsh availability probe exited with status null/,
  );
});

test("verification reference retains runbook dependency and authority boundaries", () => {
  for (const pullRequest of [24, 25, 26]) {
    assert.match(reference, new RegExp(`PokeNotesApp/pull/${pullRequest}\\)`));
  }

  assert.match(reference, /#25 must merge before #26/);
  assert.match(reference, /illustrative external write/i);
  assert.match(reference, /currently has no local Vercel CLI/i);
  assert.match(reference, /Do not delete or restore unrelated files/i);
});
