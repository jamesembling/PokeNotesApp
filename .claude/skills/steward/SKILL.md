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

Merge with **squash**, keeping the PR title and number as the commit subject. Then tell James it merged, in one line.

If the head changes after James's request because someone else pushed, re-check against the new head; do not merge commits James has not seen without saying so first.

## When a check fails

- Failure caused by the PR: fix, validate locally, push, and keep waiting.
- Failure unrelated to the PR (red on `main` too, or an external service the diff does not touch): do not merge. Tell James what failed and why it is not this PR's, then wait for his call.
- Re-run a job at most once, and only after writing down why the failure looks unrelated or flaky.

## Review findings

- Fix red-circle and blocking findings before merging.
- Optional (yellow) findings: reply once with the decision and resolve. Carry correct ones into a push that already changes the PR's files.
