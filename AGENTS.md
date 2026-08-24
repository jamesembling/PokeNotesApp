<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Repository routing

- **Domain language:** Before naming or changing a product concept, read `CONTEXT.md`. Deck Aggregate compatibility work also requires `docs/adr/0001-preserve-deck-aggregate-during-relational-cutover.md`; Deck List ownership, Deck Strategy association, or Tournament snapshot work also requires `docs/adr/0002-first-class-deck-lists-and-tournament-snapshots.md`.
- **Notion issues:** Before reading, creating, triaging, or updating an issue or specification, read `docs/agents/issue-tracker.md`.
- **Database migrations:** Before authoring, reviewing, or releasing a Supabase schema change, read `docs/migration-release.md`. Local hooks validate; only the controlled production workflow deploys.
- **Reference data:** Before changing a catalog or cached reference dataset, read `docs/agents/reference-data.md`.
- **Deck-list ordering:** Before changing a deck-list sort, snapshot, share, or `sortedCards` path, read `docs/agents/deck-list-ordering.md`.
- **Performance:** Before making or reporting a performance claim, read `docs/performance-targets.md` and identify the measurement source.
- **Authenticated browser checks:** When a PokeNotes page reaches a login wall, use the `pokenotes-browser-auth` skill when available; otherwise follow README **Authenticated local testing**.
- **Local database and browser E2E:** Before starting or resetting local Supabase, changing browser fixtures, or running authenticated state-changing UI checks, read `docs/agents/local-e2e.md`. Use the committed synthetic fixtures and fixed local-only commands; production data and hosted databases stay outside this workflow.
- **Tests:** Before adding, renaming, consolidating, or reviewing tests, read `docs/agents/testing.md`. Tests are owned by durable behavior and production seams, not by PRs, review rounds, fixes, or implementation phases. Refactors, telemetry, performance work, loading states, and visual polish must finish with zero or negative net executed-case growth unless James explicitly approves growth; never use `.ts`/`.tsx` source regexes as runtime evidence. Count nested/generated cases, report the exact delta, and score every net-new case before handoff.
