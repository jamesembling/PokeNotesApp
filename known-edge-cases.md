# Behavior and Compatibility Contracts

> **Status:** Current summary, verified against the repository on 14 July 2026.

The previous version of this file was a pre-rebuild migration guide. It referred to removed JavaScript modules, planned phases, and one-off data counts, so it has been replaced with the current contracts below. Detailed regression behavior belongs in tests and code; confirmed unresolved work belongs in [`docs/application-health-review.md`](./docs/application-health-review.md).

## Deck Aggregate Compatibility

- Deck Lists and Matchup Plans still exist in both legacy JSON and relational tables during the approved compatibility period.
- Child identity is scoped by account, Deck Strategy, and child ID. Never deduplicate or join by child ID alone.
- Reads must use [`lib/decks/aggregate-compatibility.ts`](./lib/decks/aggregate-compatibility.ts); writes must use [`lib/decks/deck-aggregate-writer.ts`](./lib/decks/deck-aggregate-writer.ts) and the transactional database RPC.
- Legacy JSON cannot be removed solely because the calendar date has passed. Follow the exit checks in [`docs/adr/0001-preserve-deck-aggregate-during-relational-cutover.md`](./docs/adr/0001-preserve-deck-aggregate-during-relational-cutover.md).
- Run `npm run audit:deck-compatibility` before any cut-over decision. Exit code `2` means the cut-over remains blocked.

## Deck List Parsing and Display

- Canonical visual ordering is Pokemon, Trainers, then Energy. Trainer subgroups are Supporter, Item, Tool, then Stadium.
- Basic Energy names from common import formats are normalized before sorting and display. Preserve the original parsed card data while deriving the canonical visual form.
- Persisted `sortedCards` is trusted only when its sort version matches the current contract. Legacy arrays may need rebuilding from `parsedCards`.
- Treat ordering as a shared contract across saved lists, linked logs, tournaments, sharing, and the calculator. Relevant regression coverage includes `tests/basic-energy-ordering.test.ts`, `tests/deck-list-visual-sort.test.ts`, and `tests/probability-calculator-decklist.test.ts`.

## Log Import and Archetype Identification

- Parser behavior is split under `lib/log-import/parser/`; do not revive the removed `battle-log.js` or `sprites.js` paths from the old application.
- Pokemon names are normalized through the catalog, multilingual names, special-form aliases, and evolution-family relationships. Required match groups prevent a multi-Pokemon archetype from matching on only one generic support line.
- Ambiguous equal-strength archetype matches fail to a safer result instead of relying on catalog order.
- User-confirmed self archetypes may create account-scoped learned rows; runtime catalog reads therefore cannot be replaced by a static Markdown list.
- Representative coverage lives in `tests/archetype-identification.test.ts`, `tests/pokemon-normalization.test.ts`, `tests/pokemon-special-forms.test.ts`, and `tests/learned-self-archetypes.test.ts`.

## Catalog Publication and Caching

- `pokemon_catalog` is refreshed by `/api/cron/sync-pokemon-catalog`, scheduled daily at 05:00 UTC in `vercel.json`.
- A successful sync invalidates the server catalog caches. Client editor option caches subscribe to invalidation only where they have been migrated to the shared resource; remaining cache work is tracked in the health review.
- Catalog fetches must retain the allowlisted-host, redirect, timeout, response-size, JSON, pagination, identity, and destructive-empty-run guards.
- The current sync still publishes in place rather than staging an atomic replacement. Treat interrupted/partial publication as an outstanding design risk, not as a solved edge case.

## Authentication and Sharing

- Production authentication uses Google OAuth. `/auth/test-login` must return `404` outside development.
- Local automated and trusted-LAN login requires the configured pairing code; saved browser state is local-only and must not be committed or printed.
- Public log shares are exact-token reads. New links expire after seven days, are limited to 50 creations per rolling 24 hours per account, and carry a validated `v1` payload capped at 256 KiB.
- Compact share tokens must remain redacted from errors and logs.

## Runtime Data and Dates

- Imported Battle Log/share JSON is structurally decoded before rendering or persistence. Do not replace runtime validation with TypeScript assertions.
- Deck cards use deterministic UK calendar formatting on both server and browser to avoid hydration differences around UTC midnight.
- Stats timelines read the newest bounded window and restore chronological display order. When truncated, the UI must identify it as the latest 5,000 games.

## Updating This Document

Add an entry only when it describes a cross-feature contract or an intentionally unresolved compatibility condition. Put implementation-specific cases in a focused regression test, and remove the entry when the underlying compatibility condition is retired.
