---
version: 1
slug: "route-decks"
primary_target: "route:/decks"
related_targets: ["route:/decks/[id]","route:/decks/[id]/matchups/[matchupId]","app/(app)/decks/page.tsx","app/(app)/decks/[id]/page.tsx","app/(app)/decks/[id]/matchups/[matchupId]/page.tsx","components/ui/DeckStrategyCollection.tsx","components/ui/DeckCard.tsx","components/ui/DecksLoadingState.tsx","components/ui/DeckStrategyWorkspace.tsx","components/ui/InlineDeckMatchupEditor.tsx","components/ui/InlineDeckMatchupHeaderControls.tsx","components/ui/deck-strategy/collection.module.css","components/ui/deck-strategy/strategy.module.css","components/ui/deck-strategy/matchup-header.module.css"]
---

# Deck Strategy and Matchup Notes

## Purpose and mode

Operate. Help a competitive player find a Deck Strategy, capture and organise working notes, and prepare a plan against a particular opposing deck. Product truth remains in `PRODUCT.md` and `CONTEXT.md`; visual authority remains in `docs/design-system.md`.

## Built direction

Extend the neutral Stats language into a working notebook: shared IBM Plex typography, semantic surfaces, explicit record and save labels, thin rules, and open sections. Notes preserve line breaks and wrap long text; archetype sprites identify records. Keep these surfaces free of nested content cards, pills, coloured outcome bars, decorative imagery, and new fonts. Inputs, shared action buttons, menus, and modal shells retain their established form treatment.

## Collection: /decks

List is the initial view; List/Tiles uses the opt-in underlined `SegmentedControl` appearance. Each entry is a whole link with a trailing chevron and visible keyboard focus. Sortable headings retain Deck left-aligned, Win rate/Record/Deck lists centred, and Updated right-aligned. Numbers are tabular, names wrap, and missing records remain explicit rather than becoming zero wins.

Use collection content width, including the space left by the sidebar, to choose density. Below 43rem, list entries show identity, Battle Log count, and chevron; at 43rem, the numerical and Updated columns appear. Tiles are flat ruled blocks with labelled numbers: one column below 43rem, two from 43rem, three from 64rem, and four from 80rem. Keep the loading ledger and empty collection open and flat, with the create action available on mobile.

## Strategy workspace: /decks/[id]

Identity and a compact labelled record lead into inline First/Second preference and save status. Quick Capture is a bounded input with a visible category destination; its default destination is Unsorted. Preserve Game Plan, Bench Plan, Tech & Changes, and Unsorted as separate sections, along with search, category filtering, edit, delete, and reorder controls.

Notes use two columns from a 768px viewport and one below it. Below 768px, categories become accordions, Game Plan starts open, and a category initially shows four matching notes with an explicit reveal control. Below 640px, category add buttons open the shared note dialog and search is disclosed by a button; the desktop Quick Capture field is hidden. Keep modal save actions reachable in the mobile footer. Matchup Notes follows as ruled links, with the existing preview and full-list dialog.

## Matchup workspace: /decks/[id]/matchups/[matchupId]

Keep the opposing deck identity and parent Deck Strategy link above labelled preference, Matchup favour, and Format controls. First/Second/Not set preserves an optional preference. Keep all existing favour options and include a stored format even when it is absent from current site options.

Retain six distinct categories: Early Game, Mid Game, Late Game, Ideal Bench, Techs Needed, and Strategy Notes. The note workspace establishes an inline-size container: use three columns only at 60rem of available content width, otherwise one column. Below a 768px viewport, use category accordions with Early Game and Strategy Notes initially open. Header controls independently reflow at 48rem of available content width.

Add and edit use the shared modal. Keep reorder and delete actions available without dragging, and phase notes movable to adjacent phases. Opening Add exposes its category; using a phase-move menu action exposes the destination. Preserve note text and category boundaries rather than merging the six categories into a single editor.

## State and data contracts

Header preferences and matchup plan notes save independently, with their own saving, saved, failed, and retry feedback. Strategy notes and preference retain their existing save path. Keep status text available to assistive technology, visible focus, usable mobile actions, reduced-motion handling, and semantic light/dark colours.

These layouts do not redefine queries, record calculations, note serialization, Deck List ownership, or stored format compatibility. Keep those contracts in their existing production modules; no new dependency is needed for this presentation.

## Source

The three route files and related components listed above, especially `components/ui/deck-strategy/collection.module.css`, `strategy.module.css`, and `matchup-header.module.css`.
