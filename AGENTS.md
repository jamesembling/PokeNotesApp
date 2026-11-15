<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Quick start

- Stack: Next.js 16, React 19, Supabase, Tailwind 3, TypeScript; Node 22+ with npm.
- If `node_modules` is missing, run `npm ci` first. The Next.js guides referenced above live there.
- Core checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`. See `docs/verification-commands.md` for targeted commands.

## Sketch by default

James tries ideas on a running localhost and ships only the ones he likes. Unless he says "ship it", "open a PR", "merge" or similar, a change request is a sketch:

- Edit the main checkout (`/Users/jamesembling/Documents/Codex/workspaces/PokeNotesV2`), where his `npm run dev` server hot-reloads on `localhost:3000`. Do not create a worktree, branch, commit, push, or PR for a sketch.
- If you were started in a worktree, say so before editing and ask whether to switch to the main checkout; a worktree's edits never reach his localhost.
- Keep checks proportionate: run `npm run typecheck` and the tests for the files you touched. The full suite, review loops and the test-consolidation report wait until he ships.
- End with what to look at on localhost (page and steps), not a PR summary. Don't confirm you're done until the dev server compiles the change.
- `npm run dev` reads the real hosted Supabase project. A sketch must not write migrations to a hosted database or run bulk data changes; for ideas that change the schema or write data in bulk, use the local stack (`npm run dev:e2e`, see `docs/agents/local-e2e.md`).
- When he says "ship it", follow **Merging** below with the sketch's working-tree changes, moved onto a branch with `git switch -c <branch>` as the `steward` skill describes.

Parallel or long-running work (several agents at once, large refactors, automations) still uses worktrees and PRs.

## Merging

- When James asks for a PR, he wants it merged into `main`. Once it is green, squash-merge it without asking again, including after you push fixes for failed checks or review findings. Don't merge if he asked for a draft or a hold, or if someone else pushed to the PR. Claude sessions follow the `steward` skill for the full procedure.
- Open a PR James asked for with the `merge-when-green` label, unless he asked for a draft or a hold. The **Merge when green** workflow merges labelled PRs once every check passes, no review thread is open and no Codex review is running. Remove the label if a stop condition below applies. Resolving a review thread does not re-trigger the workflow; if you resolve threads without pushing, run `gh workflow run merge-when-green.yml -f pr_number=<n>`.
- After a merge, fast-forward local `main` to `origin/main`. Never force, reset or stash to do it; if the fast-forward is refused, tell James why.
- Merge a PR only when every CI check has passed, including Database behavior. A check skipped because no relevant files changed counts as passed; a pending or failed check does not.
- Explain why a check failed before rerunning it. Never bypass a failure by rerunning until green without that explanation.
- If a check fails for a reason unrelated to the PR, stop and tell James instead of merging.

## Repository routing

- **Domain language:** Before naming or changing a product concept, read `CONTEXT.md`. Deck Aggregate compatibility work also requires `docs/adr/0001-preserve-deck-aggregate-during-relational-cutover.md`; Deck List ownership, Deck Strategy association, or Tournament snapshot work also requires `docs/adr/0002-first-class-deck-lists-and-tournament-snapshots.md`.
- **Notion issues:** Before reading, creating, triaging, or updating an issue or specification, read `docs/agents/issue-tracker.md`.
- **Database migrations:** Before authoring, reviewing, or releasing a Supabase schema change, read `docs/migration-release.md`. Local hooks validate; only the controlled production workflow deploys, and the session that merges a migration dispatches it.
- **Reference data:** Before changing a catalog or cached reference dataset, read `docs/agents/reference-data.md`.
- **Battle Replay:** Before changing Battle Replay reconstruction, display, card information or its tests, read `docs/agents/battle-replay-rules.md`. It is James's authoritative game-rule contract and overrides any earlier "never infer" guidance, including the prototype's productisation note. Measure success against real saved logs, never invented log wording.
- **Deck-list ordering:** Before changing a deck-list sort, snapshot, share, or `sortedCards` path, read `docs/agents/deck-list-ordering.md`.
- **Performance:** Before making or reporting a performance claim, read `docs/performance-targets.md` and identify the measurement source.
- **Authenticated browser checks:** When a PokeNotes page reaches a login wall, use the `pokenotes-browser-auth` skill when available; otherwise follow README **Authenticated local testing**.
- **Local database and browser E2E:** Before starting or resetting local Supabase, changing browser fixtures, or running authenticated state-changing UI checks, read `docs/agents/local-e2e.md`. Use the committed synthetic fixtures and fixed local-only commands; production data and hosted databases stay outside this workflow. If Docker is unavailable on macOS, run `open -a Docker` and wait for `docker info` to succeed before treating the fixture environment as blocked.
- **Tests:** Before adding, renaming, consolidating, or reviewing tests, read `docs/agents/testing.md`. It sets the zero-growth default for non-feature work and the before-handoff consolidation report.
