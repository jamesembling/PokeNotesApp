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

## Moving work onto a PR branch

Move uncommitted work with git, never by copying files. Re-creating edits in another checkout or session leaves the originals behind, uncommitted, after the PR merges.

- To put a worktree's edits on a new branch, run `git switch -c <branch> origin/main` in that same worktree; uncommitted changes come along. If the switch is refused because they conflict with `main`, run `git switch -c <branch>` (it starts at the current commit, so it always succeeds), commit there, then `git rebase origin/main`. Never commit the edits on `main` or on another session's branch.
- To land another session's or worktree's work, commit it there first, then bring the commit over with `git cherry-pick` or push that branch.
- Keep a note of every worktree the work passed through, for **Clean up leftover edits** below.

## Opening the PR

When you open a PR James asked for, add the `merge-when-green` label (`gh pr create --label merge-when-green`, or `gh pr edit <n> --add-label merge-when-green`). Leave it off a draft or a PR he asked you to hold. The **Merge when green** GitHub workflow then merges the PR once it is green, even if no session is awake when CI finishes. It applies the same three conditions as **Merge when green** below and also waits for a running Codex review. Remove the label (`gh pr edit <n> --remove-label merge-when-green`) if you hit a stop condition under **When to stop and ask**.

## Waiting on CI

- Never loop on `gh pr checks`, `sleep`, or repeated status fetches. Subscribe to the PR and end the turn; check results arrive as events.
- Both required checks run on every PR, so both always report: `verify` (CI workflow) and `Database behavior`. `Database behavior` decides inside the job whether the diff is relevant; a run that finds nothing relevant still finishes green.
- A green result while another check is still running means nothing to do yet. Wait for the next event.
- If an automated code review (such as Codex) is still running on the head when the checks go green, wait for it to finish before merging.

## Merge when green

If you are awake when the PR goes green, merge it yourself rather than waiting for the workflow. Either way the merge is the same. On each wake, re-fetch the PR on its current head and merge only when all of these hold:

1. Every check on the head commit is successful or skipped. Pending, failed, cancelled, or timed-out checks block the merge.
2. Both `verify` and `Database behavior` are present on the head commit.
3. There is no merge conflict and no unresolved review thread waiting on a reply.

Merge with **squash**, keeping the PR title and number as the commit subject, and pin the merge to the head SHA you just checked (`expectedHeadSha`, or `gh pr merge --match-head-commit`) so a later push cannot slip in. Treat the merge call's result as a diagnostic: confirm with a separate read that the PR is merged at that SHA before telling James, in one line, and never retry a merge on the call's result alone. See `docs/verification-commands.md` **Pull request integration is a two-phase contract**.

## Update local main

After confirming the merge (yours, or the workflow's when you next wake), bring James's local `main` up to date with `origin/main`. Fast-forward only, and never discard local work:

- Run `git fetch origin`, then `git worktree list` to see whether any checkout has `main` checked out.
- If a checkout is still on the merged PR's branch and its tree is clean, move it off first: `git switch main` there, or `git switch --detach origin/main` if another worktree already has `main`. Then delete the local branch with `git branch -D <branch>`, but only if its tip is the PR's merged head. A checkout left on a squash-merged branch shows that branch's whole diff as if it were unfinished work.
- If a checkout has `main` checked out and its tree is clean, run `git -C <that path> merge --ff-only origin/main`.
- If no checkout has `main` checked out, run `git fetch origin main:main`, which fast-forwards the branch without switching to it.
- If the fast-forward is refused (uncommitted changes, or local commits on `main` that aren't on `origin/main`), don't force, reset or stash. Tell James why `main` wasn't updated.

Confirm with `git rev-parse main origin/main` that both point at the merge commit before reporting.

## Clean up leftover edits

Before reporting the merge, run `git status --short` in every worktree the work passed through: your own, any side session's that drafted part of it, and the checkout the PR branch came from. Worktrees the work never touched are not yours to clean.

- If a worktree still has uncommitted edits to the PR's files, compare each one with `main` (`git diff origin/main -- <file>`, and check that deleted files are gone from `main` too).
- If `main` already has every edit, or a newer version of it, discard them with `git restore --staged --worktree -- <files>` (and `rm` for untracked files identical to `main`'s copy) and tell James in one line.
- If any edit is not on `main`, leave the worktree alone and tell James which worktree it is and which files.
- Never use `git stash`, `git clean`, or `git reset --hard` for this.

## When a check fails

- Failure caused by the PR: fix, validate locally, push, and keep waiting. The new head merges once it is green.
- Re-run a job at most once, and only after writing down why the failure looks unrelated or flaky.

## Review findings

- Fix red-circle and blocking findings, validate locally, push, reply in the thread, and resolve it. The new head merges once it is green.
- Optional (yellow) findings: reply once with the decision and resolve. Carry correct ones into a push that already changes the PR's files.
- Resolving a thread does not trigger the **Merge when green** workflow. If you resolved threads without pushing and the checks are already green, re-run it: `gh workflow run merge-when-green.yml -f pr_number=<n>`.

## When to stop and ask

Do not merge. Tell James what happened and wait for his call when:

- a check fails for a reason unrelated to the PR (red on `main` too, or an external service the diff does not touch);
- a blocking review finding cannot be fixed safely within the PR, or fixing it needs a product decision;
- a merge conflict needs judgment about which behaviour to keep;
- the head changed from a push you did not make.
