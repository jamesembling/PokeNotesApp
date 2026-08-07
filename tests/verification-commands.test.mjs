import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const referenceUrl = new URL("../docs/verification-commands.md", import.meta.url);
const reference = await readFile(referenceUrl, "utf8");
const execFileAsync = promisify(execFile);

function zshBlocks(markdown) {
  return [...markdown.matchAll(/```zsh\n([\s\S]*?)\n```/g)].map((match) => match[1]);
}

function normalizeShellContinuations(block) {
  return block.replace(/\\\r?\n\s*/g, " ");
}

function assertNoOneStepPrMutation(block) {
  const normalized = normalizeShellContinuations(block);
  assert.doesNotMatch(normalized, /gh pr merge[\s\S]*?--delete-branch/);
  assert.doesNotMatch(
    normalized,
    /gh pr checks[\s\S]*?--watch[\s\S]*?(?:&&|\|\|)[\s\S]*?gh pr merge/,
  );
  assert.doesNotMatch(
    normalized,
    /gh pr merge[\s\S]*?(?:&&|\|\||;)[\s\S]*?(?:git (?:worktree|branch|push)|gh api)/,
  );
}

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
    "gh pr checks \"$pokenotes_pr_number\" --watch --repo \"$pokenotes_repo\"",
    "--json bucket,name,state,workflow",
    "test \"$pokenotes_check_snapshot_exit_code\" -eq 0",
    "pokenotes_reviewed_head='replace-with-independently-reviewed-full-40-character-sha'",
    "git remote get-url --push --all \"$pokenotes_push_remote\"",
    "test \"$(awk 'END { print NR }' <<< \"$pokenotes_push_urls\")\" -eq 1",
    "git ls-remote \"$pokenotes_push_url\" refs/heads/main",
    "test \"$(jq -r '.headRefOid' <<< \"$pokenotes_premerge_snapshot\")\" = \"$pokenotes_reviewed_head\"",
    "test \"$(jq -r '.baseRefName' <<< \"$pokenotes_premerge_snapshot\")\" = main",
    "gh pr merge \"$pokenotes_pr_number\" --repo \"$pokenotes_repo\" --squash",
    "--match-head-commit \"$pokenotes_reviewed_head\"",
    "--json state,mergedAt,mergeCommit,headRefOid,baseRefName",
    "test \"$(jq -r '.baseRefName' <<< \"$pokenotes_postmerge_snapshot\")\" = main",
    "test \"$(jq -r '.headRefOid' <<< \"$pokenotes_postmerge_snapshot\")\" = \"$pokenotes_reviewed_head\"",
    "test \"$pokenotes_postmerge_main\" = \"$pokenotes_merge_commit\"",
    "test \"$pokenotes_completed_worktree\" != \"$pokenotes_operator_cwd\"",
    "test \"$pokenotes_target_common_dir\" = \"$pokenotes_common_dir\"",
    "status --porcelain=v1 --untracked-files=all",
    "symbolic-ref --quiet HEAD",
    "test \"$(git -C \"$pokenotes_completed_worktree\" rev-parse HEAD)\" = \"$pokenotes_reviewed_head\"",
    "git worktree remove -- \"$pokenotes_completed_worktree\"",
    "git push \"$pokenotes_push_url\" --delete \"$pokenotes_head_branch\"",
    "pokenotes-pr-body.md.XXXXXX",
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

test("PR integration contract verifies remote truth before separately authorized cleanup", () => {
  const integrationSection = reference.match(
    /## Pull request integration is a two-phase contract[\s\S]*?(?=\n## Vercel inspection)/,
  )?.[0];
  assert.ok(integrationSection, "missing two-phase integration section");

  assert.match(reference, /Treat command exits as diagnostics and verify remote state with/);
  assert.match(reference, /\.bucket != "pass" and \.bucket != "skipping"/);
  assert.match(reference, /mandatory regardless of the\s+merge command's exit code/);
  assert.match(reference, /Only the post-merge snapshot establishes remote success/);
  assert.match(reference, /Cleanup is separately authorized and verified/);
  assert.match(reference, /Remote branch deletion is a distinct external write/);
  assert.match(reference, /git branch -D -- "\$pokenotes_head_branch"/);
  assert.match(integrationSection, /never derive it from the pull request snapshot/);
  assert.match(integrationSection, /refs\/heads\/main/);
  assert.match(integrationSection, /exact live `refs\/heads\/main` tip/);
  assert.match(integrationSection, /test "\$pokenotes_completed_worktree" != "\$pokenotes_operator_cwd"/);
  assert.match(integrationSection, /test "\$pokenotes_registration_count" -eq 1/);
  assert.match(integrationSection, /test "\$pokenotes_registration_count" -eq 0/);
  assert.equal(
    integrationSection.match(/git ls-remote "\$pokenotes_push_url" refs\/heads\/main/g)?.length,
    2,
  );
  assert.equal(
    integrationSection.match(/\.baseRefName' <<< "\$pokenotes_(?:pre|post)merge_snapshot"\)" = main/g)
      ?.length,
    2,
  );
  assert.equal(
    integrationSection.match(
      /\.headRefOid' <<< "\$pokenotes_(?:pre|post)merge_snapshot"\)" = "\$pokenotes_reviewed_head"/g,
    )?.length,
    2,
  );
  assert.match(integrationSection, /case "\$pokenotes_push_url" in/);
  assert.doesNotMatch(integrationSection, /git ls-remote "https:\/\/github\.com\/\$pokenotes_repo/);
  assert.doesNotMatch(integrationSection, /pokenotes_reviewed_head=.*gh pr view/);

  const integrationBlocks = zshBlocks(integrationSection);
  for (const block of integrationBlocks) {
    assertNoOneStepPrMutation(block);
  }

  const zshProbe = spawnSync("zsh", ["-c", "exit 0"], { encoding: "utf8" });
  if (zshIsAvailable(zshProbe)) {
    for (const block of integrationBlocks) {
      const syntaxCheck = spawnSync("zsh", ["-n"], { encoding: "utf8", input: block });
      assert.equal(syntaxCheck.status, 0, syntaxCheck.stderr);
    }
  }

  const unsafeMutationFixtures = [
    'gh pr merge "$pr" \\\n      --match-head-commit "$reviewed" \\\n      --delete-branch',
    'gh pr checks "$pr" --watch \\\n      && gh pr merge "$pr" --match-head-commit "$reviewed"',
    'gh pr merge "$pr" --match-head-commit "$reviewed" \\\n      || git worktree remove "$completed_worktree"',
    'gh pr merge "$pr" --match-head-commit "$reviewed" \\\n      && git push "$push_url" --delete "$head_branch"',
    'gh pr merge "$pr" --match-head-commit "$reviewed"; git branch -D "$head_branch"',
  ];
  for (const fixture of unsafeMutationFixtures) {
    assert.throws(() => assertNoOneStepPrMutation(fixture), assert.AssertionError);
  }
});

test("PR body mktemp template creates concurrent unique files and cleans exact paths", async (t) => {
  const templateName = reference.match(/pokenotes-pr-body\.md\.X{6}/)?.[0];
  assert.ok(templateName, "missing suffix-ending PR body mktemp template");

  const fixtureRoot = await mkdtemp(join(tmpdir(), "pokenotes-pr-body-template-"));
  t.after(() => rm(fixtureRoot, { force: true, recursive: true }));
  const templatePath = join(fixtureRoot, templateName);
  const [{ stdout: firstOutput }, { stdout: secondOutput }] = await Promise.all([
    execFileAsync("mktemp", [templatePath]),
    execFileAsync("mktemp", [templatePath]),
  ]);
  const firstPath = firstOutput.trim();
  const secondPath = secondOutput.trim();

  assert.notEqual(firstPath, secondPath);
  assert.doesNotMatch(firstPath, /X{6}/);
  assert.doesNotMatch(secondPath, /X{6}/);
  assert.equal(await readFile(firstPath, "utf8"), "");
  assert.equal(await readFile(secondPath, "utf8"), "");

  await rm(firstPath);
  await rm(secondPath);
  await assert.rejects(readFile(firstPath), { code: "ENOENT" });
  await assert.rejects(readFile(secondPath), { code: "ENOENT" });
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
