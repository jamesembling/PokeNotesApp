<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Repository routing

- **Domain language:** Before naming or changing a product concept, read `CONTEXT.md`. Deck Aggregate compatibility work also requires `docs/adr/0001-preserve-deck-aggregate-during-relational-cutover.md`.
- **Notion issues:** Before reading, creating, triaging, or updating an issue or specification, read `docs/agents/issue-tracker.md`.
- **Database migrations:** Before authoring, reviewing, or releasing a Supabase schema change, read `docs/migration-release.md`. Local hooks validate; only the controlled production workflow deploys.
- **Reference data:** Before changing a catalog or cached reference dataset, read `docs/agents/reference-data.md`.
- **Deck-list ordering:** Before changing a deck-list sort, snapshot, share, or `sortedCards` path, read `docs/agents/deck-list-ordering.md`.
- **Performance:** Before making or reporting a performance claim, read `docs/performance-targets.md` and identify the measurement source.
- **Authenticated browser checks:** When a PokeNotes page reaches a login wall, use the `pokenotes-browser-auth` skill when available; otherwise follow README **Authenticated local testing**.
