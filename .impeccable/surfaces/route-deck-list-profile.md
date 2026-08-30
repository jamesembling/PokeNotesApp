---
version: 1
slug: "route-deck-list-profile"
primary_target: "route:/deck-lists/[listId]"
related_targets: ["route:/decks/[id]/lists/[listId]","app/(app)/deck-lists/[listId]/page.tsx","app/(app)/decks/[id]/lists/[listId]/page.tsx","components/ui/DeckListProfile.tsx","components/ui/deck-list/profile.module.css","components/ui/DeckListVisualGrid.tsx","components/ui/DeleteDeckListButton.tsx","components/ui/DeleteConfirmDialog.tsx"]
---

# Deck List Profile

## Purpose and mode

Operate. Help a competitive player inspect a saved Deck List, copy its original text, review its details, and deliberately edit or change its optional Deck Strategy association. Product language remains in `CONTEXT.md`; visual authority remains in `docs/design-system.md`. The accepted Tournament snapshot direction in ADR 0002 is not an implementation claim for this surface.

## Built direction

Extend the approved Stats, Deck Strategy, and Calculator world: shared IBM Plex typography, neutral semantic foregrounds and surfaces, open sections, tabular quantities, and thin rules. The existing page header leads into a compact composition row with Copy List Text, followed by dominant real card artwork and supporting record details. Keep that reading order. The profile adds no enclosing cards, pills, decorative colour bars, or new fonts; shared controls and the card artwork retain their established shapes and treatment.

List details contains Format, Date, and Created by. Deck Strategy shows the current association as a plain link or Standalone list. There is no Notes panel on the profile. Use the shared heading primitives, not a separate title scale. Long list titles, metadata, and strategy names must wrap within their available space.

## Responsive layout

Use the profile's available content width, including the space left by the app sidebar. At 64rem or wider, the artwork occupies the flexible main column beside a 16rem details rail, with a 2.5rem gap. The rail stacks List details and Deck Strategy with a rule between them.

Below 64rem, details follow the artwork behind a top rule. List details and Deck Strategy share two columns. At 30rem or less, those sections become a single column in the same order and the vertical spacing tightens. The composition row wraps without hiding labels or quantities; Copy List Text can move onto its own line.

The artwork has its own named container. Its grid uses four columns by default, six from 36rem, and eight from 60rem, measured within the artwork column rather than the viewport or whole profile. Keep the shared card rendering and quantities intact when changing the surrounding layout.

## Record meaning and empty states

- Composition sums quantities from the supplied `sortedCards`, with Cards, Pokémon, Trainers, and Energy explicitly labelled. Include Uncategorised only when a card quantity falls outside those categories. These are stored quantities, not a complete-deck or legality verdict.
- An empty `sortedCards` array shows Card count unavailable and No card preview yet, with guidance to edit the list. Do not replace the saved raw text or invent cards for the preview.
- Unavailable format or creator values, and missing or invalid dates, show Not set. Valid dates use the shared calendar-date formatter and semantic time markup.
- Missing or inaccessible records keep the existing not-found header and route-appropriate return link in an open layout.

## Interaction contracts

Copy List Text uses the saved `rawList`, not text reconstructed from card order. The shared copy control is absent for blank raw text and retains its Copied and Copy failed feedback.

On both routes, reopening Edit List after a successful save must use the latest saved name, notes, and save version. The editor instance is keyed to the list identity and `updatedAt` so refreshed server data replaces cached editor state.

On `/deck-lists/[listId]`, the header uses the shared action group for Edit List and, when allowed, Delete List. The Deck Strategy section uses a native details/summary disclosure labelled Change association or Link a Deck Strategy. Opening it reveals a labelled native select, Standalone, the account-owned strategy options, and Save association. Choosing an option does not save until the form is submitted. Keep the hidden Deck List identity and `updatedAt` save version in the existing action contract, with visible focus on the disclosure, select, and links.

The associated name comes from the current Deck List association. On `/decks/[id]/lists/[listId]`, show the route's strategy name only when its ID matches the list's current `deckId`; otherwise use the neutral View linked strategy fallback. The link always uses the list's current association ID. This nested route retains Edit List and Back to Deck, without adding delete or association controls.

Legacy-only records on the first-class route retain the explanatory notice and Edit List path, but no Delete List or association form. Saving through the existing editor remains the path to first-class list capabilities; the profile does not create a separate adoption operation.

Delete List opens the shared confirmation dialog rather than expanding the page header. The message distinguishes removing the Deck List and its links from deleting the Battle Log or Tournament records themselves. It does not promise preservation of a Tournament Deck List Snapshot. Confirm submits the existing list identity and save version; while pending, show Deleting... and disable the dialog actions and dismissal. Dismissing the dialog before submission returns focus to Delete List.

## Preserved boundaries

Both routes continue to require the current user and use their existing account-scoped read queries. Keep saved notes, editor defaults, save-version handling, association and deletion actions, navigation, and legacy compatibility behavior unchanged by presentation work. Removing the profile's Notes panel does not remove notes from the saved record or existing editor.

`DeckListProfile` consumes the supplied sorted cards without reordering them. The shared `DeckListVisualGrid` still owns visual-card preparation, basic Energy treatment, card links, image sources, image quality, and responsive image sizes. The profile's grid class only changes layout; it does not replace the shared sorting or image-loading contracts. Retain semantic light/dark colours and shared keyboard behavior.

## Source

`app/(app)/deck-lists/[listId]/page.tsx`, `app/(app)/decks/[id]/lists/[listId]/page.tsx`, `components/ui/DeckListProfile.tsx`, and `components/ui/deck-list/profile.module.css`; shared `DeckListVisualGrid`, `DeckListCard`, `CopyDeckListButton`, `LazyDeckListEditorButton`, `PageHeader`, `PageActions`, `DeleteDeckListButton`, and `DeleteConfirmDialog`. Mutation behavior remains in the existing Deck List actions and editor; this brief records the built presentation, not new data guarantees or runtime performance measurements.
