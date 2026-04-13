# Agent Notes

## Deck List Visual Ordering

Treat deck list visual ordering as a sensitive, user-visible contract.

If a change touches, depends on, or could indirectly affect any of the following, call that out to the user before proceeding:

- [lib/deck-lists/sort.ts](/Users/jamesembling/Documents/Codex/workspaces/PokeNotesV2/lib/deck-lists/sort.ts)
- [lib/deck-lists/local-sort.ts](/Users/jamesembling/Documents/Codex/workspaces/PokeNotesV2/lib/deck-lists/local-sort.ts)
- [lib/deck-lists/version.ts](/Users/jamesembling/Documents/Codex/workspaces/PokeNotesV2/lib/deck-lists/version.ts)
- [lib/db/decks.ts](/Users/jamesembling/Documents/Codex/workspaces/PokeNotesV2/lib/db/decks.ts)
- [app/(app)/decks/actions.ts](/Users/jamesembling/Documents/Codex/workspaces/PokeNotesV2/app/(app)/decks/actions.ts)
- Any deck-list snapshot or sharing path that carries `sortedCards`

Required behavior:

- Do not casually change deck-list ordering rules.
- Do not trust persisted `sortedCards` unless they are known to match the current canonical sort version.
- If a change could alter deck list visual order for existing saved lists, linked logs, tournaments, or shared views, explicitly warn the user before making the change.
- Add or update regression tests for legacy grouped-but-misordered deck lists, not just obviously mixed-category arrays.

The expected canonical order is:

- Pokemon first
- Trainers second
- Energy last
- Trainer subgroups ordered Supporter, Item, Tool, Stadium
- Legacy saved lists may need rebuilding from `parsedCards` instead of trusting stored `sortedCards`
