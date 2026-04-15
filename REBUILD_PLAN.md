# Poke Notes Launch Hardening

This file tracks the remaining launch-hardening work against the current repo, not the original rebuild phases.

## Completed

- Core app shipped across logs, decks, stats, calculator, admin, and import flows.
- Share links hardened with reuse/revoke support, route-specific not-found handling, and robots blocking for shared URLs.
- Structured production-safe error handling added across the main app/global boundaries, high-risk server actions, and selected API routes.
- Launch docs and local env setup cleaned up (`README.md`, `.env.example`, `SECURITY.md`, `CONTRIBUTING.md`).
- Dead matchup placeholder UI removed.
- Type cleanup landed, including the `selfMulligans` rename and removal of the duplicate root `types.ts`.
- Grouped deck-log regression coverage added for the hot-path deck overview queries.

## In Progress

- Deck/log backfill hardening:
  - keep grouped deck-log reads batched
  - preserve display-only fallback for unresolved legacy logs
  - add conservative persisted backfill for uniquely matchable logs only

## Remaining

- Search UX and query hardening for battle logs.
- Optional card-metadata enrichment follow-up:
  - trainer subtype backfill for saved deck lists
  - catalog refresh automation if we still want it for launch
- Broader production-error review for any remaining non-hardened routes or actions that prove noisy in real use.

## Stale / Pending Re-Scope

- Competitive-data sync.
  - The old competitive-data tables were removed in `sql/2026-04-13-remove-competitive-data.sql`.
  - There is no current sync script in `package.json`.
  - Any replacement needs a fresh scoped plan before implementation.

## Notes

- `linked_deck_list_id` remains display-driven unless we introduce a deterministic persisted rule.
- Historical rebuild-phase notes and old deployment blockers are intentionally left out here because they no longer reflect the current repo state.
