# Deck-list Ordering

Deck-list visual ordering is a shared product contract. Review every affected saved-list, Battle Log, Tournament, and shared-view path before changing it.

## Canonical order

1. Pokemon
2. Trainers: Supporter, Item, Tool, Stadium
3. Energy

Persisted `sortedCards` is current only when its version matches `CANONICAL_DECK_LIST_SORT_VERSION`. Rebuild stale ordering from `parsedCards`.

## Sensitive paths

- `lib/deck-lists/`
- `lib/db/decks.ts`
- `app/(app)/decks/actions.ts`
- snapshots and sharing paths carrying `sortedCards`

## Completion

Account for every affected read and write path. Add regression coverage for legacy lists that are grouped by category but misordered within a group, then verify an existing saved list and every affected linked or shared view.
