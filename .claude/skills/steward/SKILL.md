---
name: steward
description: PokeNotes conventions for driving a pull request to green and merging it once James has asked. Use when watching a PR's CI or reviews, or when James says "merge when green".
---

# PR stewardship

Repository conventions for PRs a Claude session opened, or drives for James. `AGENTS.md` **Merging** still applies and wins on any conflict.

## Waiting on CI

- Never loop on `gh pr checks`, `sleep`, or repeated status fetches. Subscribe to the PR and end the turn; check results arrive as events.
- Both required checks run on every PR, so both always report: `verify` (CI workflow) and `Database behavior`. `Database behavior` decides inside the job whether the diff is relevant; a run that finds nothing relevant still finishes green.
- A green result while another check is still running means nothing to do yet. Wait for the next event.

## Merge when green

Merge only after James asks for that specific PR, for example "merge PR 97 when green". This skill describes how; it does not grant permission.

On each wake after that request, re-fetch the PR on its current head and merge only when all of these hold:

1. Every check on the head commit is successful or skipped. Pending, failed, cancelled, or timed-out checks block the merge.
2. Both `verify` and `Database behavior` are present on the head commit.
3. There is no merge conflict and no unresolved review thread waiting on a reply.

Merge with **squash**, keeping the PR title and number as the commit subject, and pin the merge to the head SHA you just checked (`expectedHeadSha`, or `gh pr merge --match-head-commit`) so a later push cannot slip in. Treat the merge call's result as a diagnostic: confirm with a separate read that the PR is merged at that SHA before telling James, in one line, and never retry a merge on the call's result alone. See `docs/verification-commands.md` **Pull request integration is a two-phase contract**.

James's request covers the head he asked about. If the head changes afterwards, whether from someone else's push or your own fix, do not merge it on the old request: tell James what changed and wait for him to approve the new head.

## When a check fails

- Failure caused by the PR: fix, validate locally, push, and keep waiting. The new head needs James's approval before it merges.
- Failure unrelated to the PR (red on `main` too, or an external service the diff does not touch): do not merge. Tell James what failed and why it is not this PR's, then wait for his call.
- Re-run a job at most once, and only after writing down why the failure looks unrelated or flaky.

## Review findings

- Fix red-circle and blocking findings before merging.
- Optional (yellow) findings: reply once with the decision and resolve. Carry correct ones into a push that already changes the PR's files.
