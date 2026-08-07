import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
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

function assertCompleteGateSnapshot(expectedGateIds, checks) {
  assert.ok(expectedGateIds.length > 0, "expected gate set must not be empty");
  assert.equal(new Set(expectedGateIds).size, expectedGateIds.length, "expected gates must be unique");
  assert.ok(checks.length > 0, "observed gate set must not be empty");

  const observedGateIds = checks.map(
    ({ workflow, name }) => `${workflow ? workflow : "external"}/${name}`,
  );
  assert.equal(new Set(observedGateIds).size, observedGateIds.length, "observed gates must be unique");
  for (const { bucket } of checks) {
    assert.ok(bucket === "pass" || bucket === "skipping", `unaccepted check bucket: ${bucket}`);
  }
  assert.deepEqual(observedGateIds.toSorted(), expectedGateIds.toSorted());
}

function assertTokensBeforeWrite(block, writeToken, guardTokens) {
  const writeIndex = block.indexOf(writeToken);
  assert.ok(writeIndex >= 0, `missing write token: ${writeToken}`);
  for (const token of guardTokens) {
    const guardIndex = block.indexOf(token);
    assert.ok(guardIndex >= 0, `missing guard token: ${token}`);
    assert.ok(guardIndex < writeIndex, `guard must precede write: ${token}`);
  }
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
    "pokenotes_expected_gate_ids=$'replace-workflow/replace-check-name\\nexternal/replace-provider-check'",
    "git remote get-url --push --all \"$pokenotes_push_remote\"",
    "test \"$(awk 'END { print NR }' <<< \"$pokenotes_push_urls\")\" -eq 1",
    "git ls-remote \"$pokenotes_push_url\" refs/heads/main",
    "test \"$(jq -r '.headRefOid' <<< \"$pokenotes_premerge_snapshot\")\" = \"$pokenotes_reviewed_head\"",
    "test \"$(jq -r '.baseRefName' <<< \"$pokenotes_premerge_snapshot\")\" = main",
    "test \"$(jq -r '.baseRefOid' <<< \"$pokenotes_premerge_snapshot\")\" = \"$pokenotes_premerge_main\"",
    "test \"$pokenotes_observed_gate_count\" -gt 0",
    "test \"$pokenotes_observed_gate_set\" = \"$pokenotes_expected_gate_set\"",
    "gh pr merge \"$pokenotes_pr_number\" --repo \"$pokenotes_repo\" --squash",
    "--match-head-commit \"$pokenotes_reviewed_head\"",
    "--json state,mergedAt,mergeCommit,headRefOid,baseRefName",
    "test \"$(jq -r '.baseRefName' <<< \"$pokenotes_postmerge_snapshot\")\" = main",
    "test \"$(jq -r '.headRefOid' <<< \"$pokenotes_postmerge_snapshot\")\" = \"$pokenotes_reviewed_head\"",
    "test \"$pokenotes_postmerge_main\" = \"$pokenotes_merge_commit\"",
    "test \"$pokenotes_prewrite_main\" = \"$pokenotes_premerge_main\"",
    "test \"$(jq -r '.baseRefOid' <<< \"$pokenotes_prewrite_snapshot\")\" = \"$pokenotes_premerge_main\"",
    "case \"$pokenotes_operator_cwd/\" in",
    "test \"$pokenotes_target_common_dir\" = \"$pokenotes_common_dir\"",
    "status --porcelain=v1 --untracked-files=all",
    "symbolic-ref --quiet HEAD",
    "test \"$pokenotes_target_head\" = \"$pokenotes_reviewed_head\"",
    "git worktree remove -- \"$pokenotes_completed_worktree\"",
    "--force-with-lease=\"$pokenotes_remote_branch_ref:$pokenotes_reviewed_head\"",
    "\":$pokenotes_remote_branch_ref\"",
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
  assert.match(integrationSection, /case "\$pokenotes_operator_cwd\/" in/);
  assert.match(integrationSection, /"\$pokenotes_completed_worktree\/"\*/);
  assert.match(integrationSection, /test "\$pokenotes_registration_count" -eq 1/);
  assert.match(integrationSection, /test "\$pokenotes_registration_count" -eq 0/);
  assert.equal(
    integrationSection.match(/git ls-remote "\$pokenotes_push_url" refs\/heads\/main/g)?.length,
    3,
  );
  assert.equal(
    integrationSection.match(/\.baseRefName' <<< "\$pokenotes_(?:premerge|prewrite|postmerge)_snapshot"\)" = main/g)
      ?.length,
    3,
  );
  assert.equal(
    integrationSection.match(
      /\.headRefOid' <<< "\$pokenotes_(?:premerge|prewrite|postmerge)_snapshot"\)" = "\$pokenotes_reviewed_head"/g,
    )?.length,
    3,
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

  const localCleanupBlock = integrationBlocks.find((block) => block.includes("git worktree remove --"));
  const remoteCleanupBlock = integrationBlocks.find((block) => block.includes("--force-with-lease="));
  const mergeBlock = integrationBlocks.find((block) => block.includes("gh pr merge"));
  assert.ok(localCleanupBlock, "missing guarded local cleanup block");
  assert.ok(remoteCleanupBlock, "missing guarded remote cleanup block");
  assert.ok(mergeBlock, "missing guarded merge block");
  assert.match(localCleanupBlock, /^set -e$/m);
  assert.match(remoteCleanupBlock, /^set -e$/m);
  assertTokensBeforeWrite(localCleanupBlock, 'git worktree remove -- "$pokenotes_completed_worktree"', [
    'test "$pokenotes_completed_path_exit_code" -eq 0',
    'test "$pokenotes_operator_cwd_exit_code" -eq 0',
    'case "$pokenotes_operator_cwd/" in',
    'test "$pokenotes_common_candidate_exit_code" -eq 0',
    'test "$pokenotes_target_common_candidate_exit_code" -eq 0',
    'test "$pokenotes_common_dir_exit_code" -eq 0',
    'test "$pokenotes_target_common_dir_exit_code" -eq 0',
    'test "$pokenotes_target_common_dir" = "$pokenotes_common_dir"',
    'test "$pokenotes_registration_exit_code" -eq 0',
    'test "$pokenotes_target_status_exit_code" -eq 0',
    'test "$pokenotes_target_branch_exit_code" -eq 0',
    'test "$pokenotes_target_head_exit_code" -eq 0',
    'test "$pokenotes_local_branch_head_exit_code" -eq 0',
    'test "$pokenotes_registration_count" -eq 1',
    'test -z "$pokenotes_target_status"',
    'test "$pokenotes_target_branch" = "refs/heads/$pokenotes_head_branch"',
    'test "$pokenotes_target_head" = "$pokenotes_reviewed_head"',
    'test "$pokenotes_local_branch_head" = "$pokenotes_reviewed_head"',
  ]);
  assertTokensBeforeWrite(remoteCleanupBlock, 'git push "$pokenotes_push_url"', [
    'test "$pokenotes_remote_branch_read_exit_code" -eq 0',
    'test "$(awk \'END { print NR }\' <<< "$pokenotes_remote_branch_line")" -eq 1',
    'test "$(awk \'{ print $2 }\' <<< "$pokenotes_remote_branch_line")" = \\\n    "$pokenotes_remote_branch_ref"',
    'test "$(awk \'{ print $1 }\' <<< "$pokenotes_remote_branch_line")" = \\\n    "$pokenotes_reviewed_head"',
  ]);
  assertTokensBeforeWrite(mergeBlock, 'gh pr merge "$pokenotes_pr_number"', [
    'test "$pokenotes_prewrite_main_exit_code" -eq 0',
    'test "$pokenotes_prewrite_snapshot_exit_code" -eq 0',
    'test "$pokenotes_prewrite_main" = "$pokenotes_premerge_main"',
    'test "$(jq -r \'.state\' <<< "$pokenotes_prewrite_snapshot")" = OPEN',
    'test "$(jq -r \'.baseRefName\' <<< "$pokenotes_prewrite_snapshot")" = main',
    'test "$(jq -r \'.baseRefOid\' <<< "$pokenotes_prewrite_snapshot")" = "$pokenotes_premerge_main"',
    'test "$(jq -r \'.headRefOid\' <<< "$pokenotes_prewrite_snapshot")" = "$pokenotes_reviewed_head"',
  ]);

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

test("expected gate policy rejects delayed, incomplete, duplicate, and unhealthy snapshots", () => {
  const expected = ["CI/verify", "external/Vercel"];
  const complete = [
    { workflow: "CI", name: "verify", bucket: "pass" },
    { workflow: null, name: "Vercel", bucket: "skipping" },
  ];
  assert.doesNotThrow(() => assertCompleteGateSnapshot(expected, complete));

  const rejectedSnapshots = [
    [],
    [complete[0]],
    [...complete, complete[0]],
    [...complete, { workflow: "external", name: "unexpected", bucket: "pass" }],
    complete.map((check, index) => (index === 0 ? { ...check, bucket: "pending" } : check)),
    complete.map((check, index) => (index === 0 ? { ...check, bucket: "fail" } : check)),
    complete.map((check, index) => (index === 0 ? { ...check, bucket: "cancel" } : check)),
  ];
  for (const snapshot of rejectedSnapshots) {
    assert.throws(() => assertCompleteGateSnapshot(expected, snapshot), assert.AssertionError);
  }
  assert.throws(() => assertCompleteGateSnapshot([], complete), assert.AssertionError);
  assert.throws(
    () => assertCompleteGateSnapshot(["CI/verify", "CI/verify"], complete),
    assert.AssertionError,
  );
});

test("remote cleanup executes the leased deletion only after every live-ref guard passes", async (t) => {
  const integrationSection = reference.match(
    /## Pull request integration is a two-phase contract[\s\S]*?(?=\n## Vercel inspection)/,
  )?.[0];
  const remoteCleanupBlock = zshBlocks(integrationSection ?? "").find((block) =>
    block.includes("--force-with-lease="),
  );
  assert.ok(remoteCleanupBlock, "missing remote cleanup block");

  const fixtureRoot = await mkdtemp(join(tmpdir(), "pokenotes-remote-cleanup-"));
  const fixtureBin = join(fixtureRoot, "bin");
  await mkdir(fixtureBin);
  t.after(() => rm(fixtureRoot, { force: true, recursive: true }));
  const fakeGit = join(fixtureBin, "git");
  await writeFile(
    fakeGit,
    [
      "#!/bin/sh",
      "if [ \"$1\" = ls-remote ]; then",
      "  if [ -e \"$DELETE_MARKER\" ]; then exit 0; fi",
      "  case \"$FAIL_STAGE\" in",
      "    remote_read) exit 23 ;;",
      "    multiple) printf '%s\\t%s\\n%s\\t%s\\n' \"$REVIEWED_SHA\" \"$REMOTE_REF\" \"$REVIEWED_SHA\" \"$REMOTE_REF\"; exit 0 ;;",
      "    wrong_ref) printf '%s\\trefs/heads/other\\n' \"$REVIEWED_SHA\"; exit 0 ;;",
      "    wrong_sha) printf '%040d\\t%s\\n' 0 \"$REMOTE_REF\"; exit 0 ;;",
      "  esac",
      "  printf '%s\\t%s\\n' \"$REVIEWED_SHA\" \"$REMOTE_REF\"",
      "  exit 0",
      "fi",
      "if [ \"$1\" = push ]; then",
      "  printf '%s\\n' \"$*\" > \"$WRITE_MARKER\"",
      "  : > \"$DELETE_MARKER\"",
      "  exit 0",
      "fi",
      "exit 99",
      "",
    ].join("\n"),
  );
  await chmod(fakeGit, 0o700);

  const reviewedSha = "a".repeat(40);
  const baseEnvironment = {
    ...process.env,
    PATH: `${fixtureBin}:${process.env.PATH}`,
    REVIEWED_SHA: reviewedSha,
    REMOTE_REF: "refs/heads/codex/reviewed",
  };
  const runFixture = (stage) => {
    const caseRoot = join(fixtureRoot, stage);
    const writeMarker = join(caseRoot, "write");
    const deleteMarker = join(caseRoot, "deleted");
    return {
      caseRoot,
      deleteMarker,
      result: spawnSync(
        "zsh",
        [
          "-c",
          [
            "pokenotes_push_url='validated-push-target'",
            "pokenotes_head_branch='codex/reviewed'",
            `pokenotes_reviewed_head='${reviewedSha}'`,
            remoteCleanupBlock,
          ].join("\n"),
        ],
        {
          encoding: "utf8",
          env: {
            ...baseEnvironment,
            FAIL_STAGE: stage,
            WRITE_MARKER: writeMarker,
            DELETE_MARKER: deleteMarker,
          },
        },
      ),
      writeMarker,
    };
  };

  for (const stage of ["remote_read", "multiple", "wrong_ref", "wrong_sha"]) {
    const caseRoot = join(fixtureRoot, stage);
    await mkdir(caseRoot);
    const { result, writeMarker } = runFixture(stage);
    assert.notEqual(result.status, 0, `fixture unexpectedly passed: ${stage}`);
    await assert.rejects(readFile(writeMarker), { code: "ENOENT" });
  }

  const successRoot = join(fixtureRoot, "success");
  await mkdir(successRoot);
  const { result, writeMarker } = runFixture("success");
  assert.equal(result.status, 0, result.stderr);
  const pushArgs = await readFile(writeMarker, "utf8");
  assert.match(
    pushArgs,
    new RegExp(`--force-with-lease=refs/heads/codex/reviewed:${reviewedSha}`),
  );
  assert.match(pushArgs, /:refs\/heads\/codex\/reviewed/);
});

test("local cleanup reaches worktree removal only after every exact target guard passes", async (t) => {
  const integrationSection = reference.match(
    /## Pull request integration is a two-phase contract[\s\S]*?(?=\n## Vercel inspection)/,
  )?.[0];
  const localCleanupBlock = zshBlocks(integrationSection ?? "").find((block) =>
    block.includes("git worktree remove --"),
  );
  assert.ok(localCleanupBlock, "missing local cleanup block");

  const fixtureRoot = await mkdtemp(join(tmpdir(), "pokenotes-local-cleanup-"));
  const fixtureBin = join(fixtureRoot, "bin");
  const commonDir = join(fixtureRoot, "common");
  const operatorDir = join(fixtureRoot, "operator");
  await mkdir(fixtureBin);
  await mkdir(commonDir);
  await mkdir(operatorDir);
  t.after(() => rm(fixtureRoot, { force: true, recursive: true }));
  const fakeGit = join(fixtureBin, "git");
  await writeFile(
    fakeGit,
    [
      "#!/bin/sh",
      "args=\"$*\"",
      "case \"$args\" in",
      "  'rev-parse --path-format=absolute --git-common-dir') [ \"$FAIL_STAGE\" = common_read ] && exit 21; [ \"$FAIL_STAGE\" = common_missing ] && { printf '/missing/common\\n'; exit 0; }; printf '%s\\n' \"$COMMON_DIR\" ;;",
      "  *'rev-parse --path-format=absolute --git-common-dir') [ \"$FAIL_STAGE\" = target_common_read ] && exit 22; [ \"$FAIL_STAGE\" = target_common_missing ] && { printf '/missing/target-common\\n'; exit 0; }; [ \"$FAIL_STAGE\" = different_common ] && { printf '%s\\n' \"$OTHER_COMMON_DIR\"; exit 0; }; printf '%s\\n' \"$COMMON_DIR\" ;;",
      "  'worktree list --porcelain') [ \"$FAIL_STAGE\" = registration_read ] && exit 23; [ -e \"$WRITE_MARKER\" ] && exit 0; [ \"$FAIL_STAGE\" = registration_missing ] && exit 0; printf 'worktree %s\\nHEAD %s\\nbranch refs/heads/%s\\n' \"$TARGET_DIR\" \"$REVIEWED_SHA\" \"$HEAD_BRANCH\" ;;",
      "  *'status --porcelain=v1 --untracked-files=all') [ \"$FAIL_STAGE\" = status_read ] && exit 24; [ \"$FAIL_STAGE\" = dirty ] && { printf ' M user-file\\n'; exit 0; }; exit 0 ;;",
      "  *'symbolic-ref --quiet HEAD') [ \"$FAIL_STAGE\" = branch_read ] && exit 25; [ \"$FAIL_STAGE\" = wrong_branch ] && { printf 'refs/heads/other\\n'; exit 0; }; printf 'refs/heads/%s\\n' \"$HEAD_BRANCH\" ;;",
      "  *'rev-parse HEAD') [ \"$FAIL_STAGE\" = target_head_read ] && exit 26; [ \"$FAIL_STAGE\" = wrong_target_head ] && { printf '%040d\\n' 0; exit 0; }; printf '%s\\n' \"$REVIEWED_SHA\" ;;",
      "  rev-parse\\ refs/heads/*) [ \"$FAIL_STAGE\" = local_ref_read ] && exit 27; [ \"$FAIL_STAGE\" = wrong_local_ref ] && { printf '%040d\\n' 0; exit 0; }; printf '%s\\n' \"$REVIEWED_SHA\" ;;",
      "  worktree\\ remove\\ --*) : > \"$WRITE_MARKER\"; rmdir \"$TARGET_DIR\" ;;",
      "  branch\\ -D\\ --*) exit 0 ;;",
      "  show-ref\\ --verify\\ --quiet*) exit 1 ;;",
      "  *) exit 99 ;;",
      "esac",
      "",
    ].join("\n"),
  );
  await chmod(fakeGit, 0o700);

  const reviewedSha = "b".repeat(40);
  const stages = [
    "common_read",
    "common_missing",
    "target_common_read",
    "target_common_missing",
    "different_common",
    "registration_read",
    "registration_missing",
    "status_read",
    "dirty",
    "branch_read",
    "wrong_branch",
    "target_head_read",
    "wrong_target_head",
    "local_ref_read",
    "wrong_local_ref",
  ];
  const runFixture = async (stage, cwd = operatorDir, targetOverride) => {
    const caseRoot = join(fixtureRoot, `case-${stage}`);
    let targetDir = targetOverride ?? join(caseRoot, "target");
    await mkdir(caseRoot);
    if (!targetOverride) {
      await mkdir(targetDir);
      targetDir = await realpath(targetDir);
    }
    const writeMarker = join(caseRoot, "write");
    const otherCommonDir = join(caseRoot, "other-common");
    await mkdir(otherCommonDir);
    const script = [
      "pokenotes_head_branch='codex/reviewed'",
      `pokenotes_reviewed_head='${reviewedSha}'`,
      localCleanupBlock.replace(
        "pokenotes_completed_worktree='/absolute/path/to/completed-worktree'",
        `pokenotes_completed_worktree='${targetDir}'`,
      ),
    ].join("\n");
    const result = spawnSync("zsh", ["-c", script], {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${fixtureBin}:${process.env.PATH}`,
        FAIL_STAGE: stage,
        COMMON_DIR: commonDir,
        OTHER_COMMON_DIR: otherCommonDir,
        TARGET_DIR: targetDir,
        WRITE_MARKER: writeMarker,
        REVIEWED_SHA: reviewedSha,
        HEAD_BRANCH: "codex/reviewed",
      },
    });
    return { result, targetDir, writeMarker };
  };

  for (const stage of stages) {
    const { result, writeMarker } = await runFixture(stage);
    assert.notEqual(result.status, 0, `fixture unexpectedly passed: ${stage}`);
    await assert.rejects(readFile(writeMarker), { code: "ENOENT" });
  }

  const successful = await runFixture("success");
  assert.equal(
    successful.result.status,
    0,
    `${successful.result.stderr}\n${successful.result.stdout}`,
  );
  assert.equal(await readFile(successful.writeMarker, "utf8"), "");

  const relative = await runFixture("relative", operatorDir, "relative-target");
  assert.notEqual(relative.result.status, 0);
  await assert.rejects(readFile(relative.writeMarker), { code: "ENOENT" });

  const missingPath = join(fixtureRoot, "missing-target");
  const missing = await runFixture("missing", operatorDir, missingPath);
  assert.notEqual(missing.result.status, 0);
  await assert.rejects(readFile(missing.writeMarker), { code: "ENOENT" });

  const descendantRoot = join(fixtureRoot, "case-descendant");
  const descendantTarget = join(descendantRoot, "target");
  const descendantCwd = join(descendantTarget, "nested");
  await mkdir(descendantRoot);
  await mkdir(descendantTarget);
  await mkdir(descendantCwd);
  const descendantWrite = join(descendantRoot, "write");
  const descendantScript = [
    "pokenotes_head_branch='codex/reviewed'",
    `pokenotes_reviewed_head='${reviewedSha}'`,
    localCleanupBlock.replace(
      "pokenotes_completed_worktree='/absolute/path/to/completed-worktree'",
      `pokenotes_completed_worktree='${descendantTarget}'`,
    ),
  ].join("\n");
  const descendantResult = spawnSync("zsh", ["-c", descendantScript], {
    cwd: descendantCwd,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fixtureBin}:${process.env.PATH}`,
      COMMON_DIR: commonDir,
      OTHER_COMMON_DIR: commonDir,
      TARGET_DIR: descendantTarget,
      WRITE_MARKER: descendantWrite,
      REVIEWED_SHA: reviewedSha,
      HEAD_BRANCH: "codex/reviewed",
    },
  });
  assert.notEqual(descendantResult.status, 0);
  await assert.rejects(readFile(descendantWrite), { code: "ENOENT" });
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
