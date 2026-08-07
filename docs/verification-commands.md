# Shell-safe verification commands

Use these repository-specific command shapes when collecting local review evidence. They are
written for zsh and the tools in this checkout. Keep variable names task-specific: names such as
`path` and `status` are special in zsh and can corrupt the shell or fail as read-only.

This reference does not replace the release runbooks. It has no code dependency on them, but it
should merge after the reviewed runbooks so every file reference resolves:

- PR [#24](https://github.com/jamesembling/PokeNotesApp/pull/24) adds
  `docs/migration-release.md` for isolated database rehearsal and production authority.
- PR [#25](https://github.com/jamesembling/PokeNotesApp/pull/25) adds
  `docs/worktree-bootstrap.md` for exact, secret-free worktree dependencies.
- PR [#26](https://github.com/jamesembling/PokeNotesApp/pull/26) adds
  `docs/isolated-auth-preview.md` for authenticated isolated previews; it is stacked on #25, so
  #25 must merge before #26.

## Tests and searches

The repository uses `tsx --test`, not Jest. Do not pass Jest-only flags such as `--runInBand`.
Run one file through the repository script, or use Node directly when filtering by test name:

```zsh
npm run test -- tests/app-url.test.ts
node --import tsx --test --test-name-pattern='falls back' tests/app-url.test.ts
```

Place Node test-runner options before the file. Use `npm run test` for the complete suite.

End ripgrep's option parsing before any pattern that begins with a dash:

```zsh
./node_modules/.bin/agent-browser --help | rg -- '--session|--state'
```

Use task-specific variables for loops and exit-code assertions:

```zsh
for candidate_file in tests/app-url.test.ts tests/security-headers.test.ts; do
  npm run test -- "$candidate_file"
done

set +e
node ./scripts/example-command.mjs
command_exit_code=$?
set -e
test "$command_exit_code" -eq 0
```

The second example is illustrative: substitute a real repository script, then deliberately verify
the expected exit code. It demonstrates safe zsh state handling, not a checked-in script.

## Downloads used as evidence

Do not pipe `curl` into an early-exiting reader when its exit status is evidence. Save the entire
response, fail on HTTP errors, assert the status, inspect the saved file, then remove only that
exact temporary file:

```zsh
download_file="$(mktemp "${TMPDIR:-/tmp}/pokenotes-download.XXXXXX")"
download_http_status="$(curl --fail --silent --show-error --location \
  --output "$download_file" --write-out '%{http_code}' https://example.com/)"
test "$download_http_status" = 200
test -s "$download_file"
rg -- '<title>Example Domain</title>' "$download_file"
find "$download_file" -type f -delete
```

`example.com` is the non-production validation target for this command shape. For review evidence,
replace it with the intended public primary-source URL and retain the status and content assertions.

## Pull request bodies

A quoted heredoc preserves Markdown backticks, dollar signs, and command-like text literally.
Validate the file locally and confirm the installed GitHub CLI supports `--body-file`:

```zsh
pr_body_file="$(mktemp "${TMPDIR:-/tmp}/pokenotes-pr-body.md.XXXXXX")"
cat > "$pr_body_file" <<'POKENOTES_PR_BODY'
## Summary

- Explain the change with `literal Markdown` and $variables left untouched.
POKENOTES_PR_BODY

test -s "$pr_body_file"
gh pr create --help | rg -- '--body-file'
```

The following is an **illustrative external write**. Run it only when PR creation is authorized,
after replacing the title and base with reviewed values:

```zsh
gh pr create --draft --base main --title 'Reviewed title' --body-file "$pr_body_file"
```

After use, delete only the exact file created by `mktemp`:

```zsh
find "$pr_body_file" -type f -delete
```

## Pull request integration is a two-phase contract

GitHub CLI commands can span remote work and later local cleanup. A non-zero exit can therefore
follow a successful remote merge, while a watcher exit does not by itself prove that every check
reached an accepted terminal state. Treat command exits as diagnostics and verify remote state with
a separate read. Never retry a merge based only on the merge command's exit code.

Before an authorized integration, bind every read and write to the exact repository, pull request,
independently reviewed head commit, and actual Git push destination. The reviewed SHA is an operator
input from completed review evidence; never derive it from the pull request snapshot. Every
placeholder below must be replaced:

```zsh
pokenotes_repo='jamesembling/PokeNotesApp'
pokenotes_pr_number='123'
pokenotes_reviewed_head='replace-with-independently-reviewed-full-40-character-sha'
pokenotes_push_remote='origin'

printf '%s\n' "$pokenotes_reviewed_head" | rg -q '^[0-9a-f]{40}$'
pokenotes_push_urls="$(git remote get-url --push --all "$pokenotes_push_remote")"
test "$(awk 'END { print NR }' <<< "$pokenotes_push_urls")" -eq 1
pokenotes_push_url="$pokenotes_push_urls"
case "$pokenotes_push_url" in
  "https://github.com/$pokenotes_repo.git"|"git@github.com:$pokenotes_repo.git"|\
  "ssh://git@github.com/$pokenotes_repo.git") ;;
  *) echo 'Push destination does not match the reviewed repository.' >&2
     return 1 2>/dev/null || exit 1 ;;
esac

pokenotes_premerge_main_line="$(git ls-remote "$pokenotes_push_url" refs/heads/main)"
test "$(awk 'END { print NR }' <<< "$pokenotes_premerge_main_line")" -eq 1
test "$(awk '{ print $2 }' <<< "$pokenotes_premerge_main_line")" = refs/heads/main
pokenotes_premerge_main="$(awk '{ print $1 }' <<< "$pokenotes_premerge_main_line")"
printf '%s\n' "$pokenotes_premerge_main" | rg -q '^[0-9a-f]{40}$'

pokenotes_premerge_snapshot="$(gh pr view "$pokenotes_pr_number" --repo "$pokenotes_repo" \
  --json state,headRefName,headRefOid,baseRefName)"
pokenotes_head_branch="$(jq -r '.headRefName' <<< "$pokenotes_premerge_snapshot")"
test "$(jq -r '.state' <<< "$pokenotes_premerge_snapshot")" = OPEN
test "$(jq -r '.baseRefName' <<< "$pokenotes_premerge_snapshot")" = main
test "$(jq -r '.headRefOid' <<< "$pokenotes_premerge_snapshot")" = "$pokenotes_reviewed_head"
test -n "$pokenotes_head_branch"
test "$pokenotes_head_branch" != null
```

### Phase 1: verify check state

The aggregate watcher is useful progress output, but its exit is not acceptance evidence. Capture it,
then always take a fresh read-only snapshot. This repository's release gate accepts only `pass` and
`skipping` buckets; any `pending`, `fail`, or `cancel` bucket stops integration:

```zsh
set +e
gh pr checks "$pokenotes_pr_number" --watch --repo "$pokenotes_repo"
pokenotes_checks_watch_exit_code=$?
set -e

set +e
pokenotes_check_snapshot="$(gh pr checks "$pokenotes_pr_number" --repo "$pokenotes_repo" \
  --json bucket,name,state,workflow)"
pokenotes_check_snapshot_exit_code=$?
set -e

test -n "$pokenotes_check_snapshot"
pokenotes_unaccepted_check_count="$(jq \
  '[.[] | select(.bucket != "pass" and .bucket != "skipping")] | length' \
  <<< "$pokenotes_check_snapshot")"
test "$pokenotes_check_snapshot_exit_code" -eq 0
test "$pokenotes_unaccepted_check_count" -eq 0
jq -r '.[] | [.workflow, .name, .bucket, .state] | @tsv' <<< "$pokenotes_check_snapshot"
```

Record both exit codes for diagnosis. The fresh snapshot must itself succeed, and its bucket assertion
must pass; neither condition substitutes for the other. If an individual workflow needs attended
monitoring, use `gh run watch <run-id> --exit-status`, then confirm its `status`, `conclusion`, and
`headSha` through a separate `gh run view --json` read.

### Phase 2: merge, then read remote truth

The merge itself is an **illustrative external write**. Run it only after review and merge authority
are explicit. Pin the reviewed head with `--match-head-commit` and omit `--delete-branch` so local and
remote cleanup cannot obscure the merge result. The follow-up read is mandatory regardless of the
merge command's exit code:

```zsh
set +e
gh pr merge "$pokenotes_pr_number" --repo "$pokenotes_repo" --squash \
  --match-head-commit "$pokenotes_reviewed_head"
pokenotes_merge_command_exit_code=$?
set -e

pokenotes_postmerge_snapshot="$(gh pr view "$pokenotes_pr_number" --repo "$pokenotes_repo" \
  --json state,mergedAt,mergeCommit,headRefOid,baseRefName)"
test "$(jq -r '.state' <<< "$pokenotes_postmerge_snapshot")" = MERGED
test "$(jq -r '.baseRefName' <<< "$pokenotes_postmerge_snapshot")" = main
test "$(jq -r '.headRefOid' <<< "$pokenotes_postmerge_snapshot")" = "$pokenotes_reviewed_head"
test -n "$(jq -r '.mergedAt // empty' <<< "$pokenotes_postmerge_snapshot")"
pokenotes_merge_commit="$(jq -r '.mergeCommit.oid // empty' <<< "$pokenotes_postmerge_snapshot")"
printf '%s\n' "$pokenotes_merge_commit" | rg -q '^[0-9a-f]{40}$'

pokenotes_postmerge_main_line="$(git ls-remote "$pokenotes_push_url" refs/heads/main)"
test "$(awk 'END { print NR }' <<< "$pokenotes_postmerge_main_line")" -eq 1
test "$(awk '{ print $2 }' <<< "$pokenotes_postmerge_main_line")" = refs/heads/main
pokenotes_postmerge_main="$(awk '{ print $1 }' <<< "$pokenotes_postmerge_main_line")"
test "$pokenotes_postmerge_main" = "$pokenotes_merge_commit"
test "$pokenotes_postmerge_main" != "$pokenotes_premerge_main"
```

Only the post-merge snapshot establishes remote success. A non-zero merge command plus a verified
`MERGED` snapshot means the merge succeeded and a later phase failed; do not issue a duplicate merge.
A zero exit without the verified snapshot is not sufficient evidence. This contract deliberately
requires the merge commit to be the exact live `refs/heads/main` tip. If concurrent integration moves
`main` before the read, the equality fails closed: stop without retrying or cleaning up, then have a
reviewer establish ancestry and race ordering separately.

### Cleanup is separately authorized and verified

Cleanup is not part of the merge proof. After the merge is verified, obtain separate authority for
the exact completed worktree, local branch, and remote branch before running these destructive
examples. Run local cleanup from a retained checkout outside the completed worktree, and never infer
cleanup success from the merge command. The guards below prove that the exact canonical path is one
clean registered worktree of the current common repository, is not the operator's current directory,
and owns the reviewed branch and commit. A squash merge does not make the old head a Git ancestor of
the base, so the separately authorized local branch deletion is intentionally forced only after
those exact checks:

```zsh
pokenotes_completed_worktree='/absolute/path/to/completed-worktree'
case "$pokenotes_completed_worktree" in
  /*) ;;
  *) echo 'Completed worktree path must be absolute.' >&2
     return 1 2>/dev/null || exit 1 ;;
esac
test -d "$pokenotes_completed_worktree"
pokenotes_completed_worktree="$(cd "$pokenotes_completed_worktree" && pwd -P)"
pokenotes_operator_cwd="$(pwd -P)"
test "$pokenotes_completed_worktree" != "$pokenotes_operator_cwd"

pokenotes_common_dir="$(cd "$(git rev-parse --path-format=absolute --git-common-dir)" && pwd -P)"
pokenotes_target_common_dir="$(cd "$(git -C "$pokenotes_completed_worktree" \
  rev-parse --path-format=absolute --git-common-dir)" && pwd -P)"
test "$pokenotes_target_common_dir" = "$pokenotes_common_dir"
pokenotes_registration_count="$(git worktree list --porcelain | awk \
  -v target="worktree $pokenotes_completed_worktree" \
  '$0 == target { count++ } END { print count + 0 }')"
test "$pokenotes_registration_count" -eq 1
test -z "$(git -C "$pokenotes_completed_worktree" status --porcelain=v1 --untracked-files=all)"
test "$(git -C "$pokenotes_completed_worktree" symbolic-ref --quiet HEAD)" = \
  "refs/heads/$pokenotes_head_branch"
test "$(git -C "$pokenotes_completed_worktree" rev-parse HEAD)" = "$pokenotes_reviewed_head"
test "$(git rev-parse "refs/heads/$pokenotes_head_branch")" = "$pokenotes_reviewed_head"

git worktree remove -- "$pokenotes_completed_worktree"
git branch -D -- "$pokenotes_head_branch"
if test -e "$pokenotes_completed_worktree"; then
  echo 'Completed worktree path still exists.' >&2
  return 1 2>/dev/null || exit 1
fi
pokenotes_registration_count="$(git worktree list --porcelain | awk \
  -v target="worktree $pokenotes_completed_worktree" \
  '$0 == target { count++ } END { print count + 0 }')"
test "$pokenotes_registration_count" -eq 0
if git show-ref --verify --quiet "refs/heads/$pokenotes_head_branch"; then
  echo 'Completed local branch still exists.' >&2
  return 1 2>/dev/null || exit 1
fi
```

Remote branch deletion is a distinct external write and requires its own authorization. Reuse the
previously validated actual push URL for the read, deletion, and final absence proof. If the branch
still exists, refuse to delete it unless its tip is the independently reviewed SHA:

```zsh
pokenotes_remote_branch_line="$(git ls-remote "$pokenotes_push_url" \
  "refs/heads/$pokenotes_head_branch")"
if test -n "$pokenotes_remote_branch_line"; then
  test "$(awk 'END { print NR }' <<< "$pokenotes_remote_branch_line")" -eq 1
  test "$(awk '{ print $2 }' <<< "$pokenotes_remote_branch_line")" = \
    "refs/heads/$pokenotes_head_branch"
  test "$(awk '{ print $1 }' <<< "$pokenotes_remote_branch_line")" = \
    "$pokenotes_reviewed_head"
  git push "$pokenotes_push_url" --delete "$pokenotes_head_branch"
fi
test -z "$(git ls-remote "$pokenotes_push_url" "refs/heads/$pokenotes_head_branch")"
```

## Vercel inspection

Do not run an unversioned on-demand `npx vercel`. This repository currently has no local Vercel CLI,
so the guard below intentionally stops rather than installing one implicitly:

```zsh
pokenotes_vercel_cli='./node_modules/.bin/vercel'
test -x "$pokenotes_vercel_cli" || {
  echo 'No repository-pinned Vercel CLI is installed; stop and use a provisioned review environment.' >&2
  return 1 2>/dev/null || exit 1
}
"$pokenotes_vercel_cli" --version
```

Once a reviewed dependency pins that binary, this read-only inspection shape is illustrative until
validated against the intended non-production deployment. Never infer the target from an alias;
record and inspect the exact deployment URL or ID:

```zsh
pokenotes_deployment_url='https://exact-preview-deployment.vercel.app'
"$pokenotes_vercel_cli" inspect "$pokenotes_deployment_url" --json --non-interactive
```

## Isolated Git fixtures

Hook processes can export repository-scoping `GIT_*` values. Start fixture Git commands from an
empty environment, carry only the executable search path, and disable global/system Git config:

```zsh
fixture_root="$(mktemp -d "${TMPDIR:-/tmp}/pokenotes-git-fixture.XXXXXX")"
fixture_repo="$fixture_root/repo"

fixture_git() {
  env -i PATH="$PATH" GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null git "$@"
}

fixture_git init --quiet "$fixture_repo"
fixture_git -C "$fixture_repo" config user.name 'PokeNotes fixture'
fixture_git -C "$fixture_repo" config user.email 'fixture@example.invalid'
```

Use only synthetic fixture content. When finished, verify the generated path still has the narrow
temporary prefix before deleting its contents:

```zsh
case "$fixture_root" in
  "${TMPDIR:-/tmp}"/pokenotes-git-fixture.*) find "$fixture_root" -depth -delete ;;
  *) echo 'Refusing unexpected fixture path' >&2; return 1 2>/dev/null || exit 1 ;;
esac
```

## Generated files and final diff

`npm run typecheck` runs `next typegen` and can rewrite tracked `next-env.d.ts`. Refuse to start if
that file already has user changes; after the check, inspect any generated change and restore only
that known-clean file:

```zsh
if ! git diff --quiet -- next-env.d.ts || ! git diff --cached --quiet -- next-env.d.ts; then
  echo 'next-env.d.ts already has changes; preserve them and stop.' >&2
  return 1 2>/dev/null || exit 1
fi
(
  set +e
  npm run typecheck
  pokenotes_typecheck_exit_code=$?
  set -e

  if ! git diff --quiet -- next-env.d.ts; then
    git diff -- next-env.d.ts
    git restore --source=HEAD --worktree -- next-env.d.ts
  fi

  exit "$pokenotes_typecheck_exit_code"
)
```

Finish with both unstaged and staged views. Do not delete or restore unrelated files merely to make
the diff smaller:

```zsh
git status --short
git diff --check
git diff --stat
git diff --name-status
git diff
git diff --cached --check
git diff --cached --stat
git diff --cached --name-status
git diff --cached
```
