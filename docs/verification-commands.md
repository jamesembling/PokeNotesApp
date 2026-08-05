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
pr_body_file="$(mktemp "${TMPDIR:-/tmp}/pokenotes-pr-body.XXXXXX.md")"
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
