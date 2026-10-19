---
name: steward
description: PokeNotes conventions for driving a pull request to green and merging it into main. Use when opening a PR for James, watching a PR's CI or reviews, or when James says "merge when green".
---

# PR stewardship

Repository conventions for PRs a Claude session opened, or drives for James. `AGENTS.md` **Merging** still applies and wins on any conflict.

## What James's request covers

When James asks for a PR — "open a PR", "ship it", "merge when green", or similar — he is asking for the change to land on `main`. That request authorizes you to merge the PR once it is green, without asking again. Don't stop at "PR opened" or come back for another approval.

The authorization covers every head you push to that PR yourself: fixes for failed checks, review findings, and merge conflicts. It does not cover:

- a PR James said to keep as a draft, hold, or leave for his review;
- a head that changed from a push you did not make — stop and tell James what changed;
- the stop conditions under **When to stop and ask** below.

## Waiting on CI

- Never loop on `gh pr checks`, `sleep`, or repeated status fetches. Subscribe to the PR and end the turn; check results arrive as events.
- Both required checks run on every PR, so both always report: `verify` (CI workflow) and `Database behavior`. `Database behavior` decides inside the job whether the diff is relevant; a run that finds nothing relevant still finishes green.
- A green result while another check is still running means nothing to do yet. Wait for the next event.
- If an automated code review (such as Codex) is still running on the head when the checks go green, wait for it to finish before merging.

## Merge when green

On each wake, re-fetch the PR on its current head and merge only when all of these hold:

1. Every check on the head commit is successful or skipped. Pending, failed, cancelled, or timed-out checks block the merge.
2. Both `verify` and `Database behavior` are present on the head commit.
3. There is no merge conflict and no unresolved review thread waiting on a reply.

Merge with **squash**, keeping the PR title and number as the commit subject, and pin the merge to the head SHA you just checked (`expectedHeadSha`, or `gh pr merge --match-head-commit`) so a later push cannot slip in. Treat the merge call's result as a diagnostic: confirm with a separate read that the PR is merged at that SHA before telling James, in one line, and never retry a merge on the call's result alone. See `docs/verification-commands.md` **Pull request integration is a two-phase contract**.

## Update local main

After confirming the merge, bring James's local `main` up to date with `origin/main`. Fast-forward only, and never discard local work:

- Run `git fetch origin`, then `git worktree list` to see whether any checkout has `main` checked out.
- If a checkout has `main` checked out and its tree is clean, run `git -C <that path> merge --ff-only origin/main`.
- If no checkout has `main` checked out, run `git fetch origin main:main`, which fast-forwards the branch without switching to it.
- If the fast-forward is refused (uncommitted changes, or local commits on `main` that aren't on `origin/main`), don't force, reset or stash. Tell James why `main` wasn't updated.

Confirm with `git rev-parse main origin/main` that both point at the merge commit before reporting.

## When a check fails

- Failure caused by the PR: fix, validate locally, push, and keep waiting. The new head merges once it is green.
- Re-run a job at most once, and only after writing down why the failure looks unrelated or flaky.

## Review findings

- Fix red-circle and blocking findings, validate locally, push, reply in the thread, and resolve it. The new head merges once it is green.
- Optional (yellow) findings: reply once with the decision and resolve. Carry correct ones into a push that already changes the PR's files.

## When to stop and ask

Do not merge. Tell James what happened and wait for his call when:

- a check fails for a reason unrelated to the PR (red on `main` too, or an external service the diff does not touch);
- a blocking review finding cannot be fixed safely within the PR, or fixing it needs a product decision;
- a merge conflict needs judgment about which behaviour to keep;
- the head changed from a push you did not make.
