---
version: 1
slug: "route-deck-lists"
primary_target: "route:/deck-lists"
related_targets: ["app/(app)/deck-lists/page.tsx","app/(app)/deck-lists/loading.tsx","components/ui/DeckListCollection.tsx","components/ui/DeckListsLoadingState.tsx","components/ui/deck-list/collection.module.css","components/ui/LazyDeckListEditorButton.tsx"]
---

# Deck List Collection

## Purpose and mode

Operate. Help a competitive player find a saved Deck List, inspect its linked usage, open its profile, or create a list. Product language remains in `CONTEXT.md`; visual authority remains in `docs/design-system.md`.

## Built direction

Extend the approved Stats and Deck Strategy language: shared IBM Plex typography, neutral semantic foregrounds and surfaces, tabular numbers, open rows, and thin rules. The shared page header contains the collection count and existing New Deck List action. Loaded and loading headers omit their divider because the collection owns the strong top rule. Keep the collection free of enclosing cards, pills, outcome colours, and decorative artwork. This refresh retains the single list view and adds no filters.

Each entry is one complete link in the Saved Deck Lists list, ending in a chevron. Names wrap within the identity column. Keep the neutral hover, visible keyboard focus, semantic light/dark colours, and reduced-motion handling. Shared headings, actions, and editor controls retain their established treatment.

## Responsive layout

Measure available collection width, including the space left by the app sidebar. At 54rem or wider, show seven columns: Deck List, Format, Battle Logs, W/L, Tournaments, Updated, and chevron. Identity is left-aligned, Format and usage values centred, and Updated right-aligned. The visual heading row is separate from the accessible labels retained within each link.

Below 54rem, identity spans the full row with Format and Updated metadata beneath the name; the chevron remains beside identity. Battle Logs, W/L, and Tournaments follow in three equal columns with visible labels. Do not hide usage measures or force the desktop columns into narrow space. Names, metadata, and large values must wrap without horizontal overflow.

## Usage and navigation contracts

- Battle Logs counts every linked Battle Log, including results other than Win or Loss. W/L shows only the linked Win and Loss counts; it need not sum to Battle Logs.
- Tournaments counts linked Tournament records, not rounds, wins, or preserved snapshots. Missing usage entries display zero counts. Format falls back to an em dash; Updated uses the shared calendar-date formatter.
- Preserve the current-user requirement, account-scoped `getDeckLists` and `getDeckListUsageCounts` reads, merged first-class/legacy records, and returned ordering. Presentation adds no client sorting or filtering.
- Row identity retains both Deck Strategy context and Deck List ID. Links open `/deck-lists/[listId]`, retaining the encoded `deckId` query hint when available and `prefetch={false}`. This layout does not alter record identity, association, ownership, or compatibility behavior.

## State and loading contracts

Keep the existing lazy New Deck List editor and creator defaults unchanged. An empty collection displays No Deck Lists saved yet while the page action remains available.

Loading preserves the page header, collection rule, column headings, and six row skeletons using the same responsive styles. Announce Loading Deck Lists through the busy status region; hide decorative skeleton content from assistive technology. This presentation makes no new data or measured runtime performance guarantees.

## Source

`app/(app)/deck-lists/page.tsx` and `loading.tsx`; `components/ui/DeckListCollection.tsx`, `DeckListsLoadingState.tsx`, and `deck-list/collection.module.css`; existing `LazyDeckListEditorButton`, `PageHeader`, `PageActions`, shared typography, calendar-date formatting, and `lib/db/deck-lists.ts` reads.
