---
version: 1
slug: "route-calculator"
primary_target: "route:/calculator"
related_targets: ["app/(app)/calculator/page.tsx","components/calculator/LazyProbabilityCalculator.tsx","components/calculator/ProbabilityCalculator.tsx","components/calculator/calculator.module.css","lib/probability-calculator/index.ts","lib/probability-calculator/stages.ts"]
---

# Probability Calculator

## Purpose and mode

Operate. Help a competitive player inspect a Deck List's opening-hand, setup, and prizing probabilities without creating or changing a saved record. Product truth remains in `PRODUCT.md` and `CONTEXT.md`; visual authority remains in `docs/design-system.md`.

## Built direction

Use an open analytical workspace with shared IBM Plex typography, neutral semantic foregrounds and surfaces, tabular numerals, and thin rules. A labelled inline Deck List editor and method guide lead into deck composition, opening hands, mulligan streaks, card probabilities, and an optional Deck List graphic. Preserve that reading order. Keep the analytical sections free of enclosing cards, pills, coloured probability bars, decorative imagery, and new fonts; shared inputs, actions, and page-header dividers keep their established treatment.

Setup/Prizing uses the opt-in underlined `SegmentedControl` appearance. Flat comparison tables put card identity on the left and numerical columns in the centre. Card names wrap; quantities and percentages remain legible. Small Pokémon sprites are identifiers, with text preserved if an image fails. The full card graphic appears only through Show cards and is unmounted when hidden.

## Responsive layout

Measure available content width, including the space left by the sidebar. Above 60rem, opening-hand summaries and mulligan streaks share a row in approximately a 1.7:1 ratio; at 60rem or less, streaks follow the opening-hand section behind a rule. The editor and guide also start side by side and stack at 40rem or less, as does the loading layout.

At 40rem or less, each card's identity spans a full row above two Setup values or four Prizing values. Repeat the metric labels visually while retaining accessible table headers and row semantics. The three opening-hand summaries stay together; at 20rem or less, smaller values and equal-height label space keep complete percentages such as `100.00%` aligned without overlap.

## Calculation meaning

- The model always assumes a 60-card deck, a seven-card opening hand, and six Prize cards. Parsed composition is displayed independently; a non-60-card list must retain the warning that calculations still assume 60 cards.
- Mulligan is the probability of no Basic Pokémon in the first seven cards. Exactly 1 Basic and 2+ Basics are conditional on a playable hand containing at least one Basic Pokémon. Preserve those denominator labels beside the values.
- Mulligan streaks show one through four consecutive mulligans. At least is the chance of reaching that streak; Exactly also requires the next hand to be playable.
- Setup groups Pokémon by name and reports their appearance in a playable opening hand. Only starter means that Pokémon is the only Basic Pokémon name available, including multiple copies; it does not mean exactly one copy.
- Prizing groups cards by category and name and reports none, one, two, or three-plus copies among six Prize cards drawn from the full 60-card deck. These odds are not adjusted for the opening hand. Preserve the existing percentage precision and boundary notation.

## Interaction, state, and loading contracts

The initial editor is empty, with a sample-list action and explicit format help. Empty or unrecognised input keeps the editor open, announces the error, and focuses the input. Recognised lists can produce results with parsing or deck-count warnings; keep those warnings visible rather than silently correcting the list. A list without Pokémon retains the Setup empty state.

A successful calculation records the analysed text, selects Setup, hides the editor and card graphic, and moves focus to the results region. Edit restores the analysed input; Cancel discards pending edits and returns to those results. Copy uses the analysed text. Clear removes input and analysis, resets Setup and card visibility, and focuses the empty editor. This is temporary client state, with no save or persistence operation.

Keep the Calculator dynamically loaded on the client, with its shared page header and an announced flat loading skeleton. Pokémon options load only after analysis exists. Shared Deck List sorting resolves asynchronously, ignores stale completions, and falls back to parsed order if unavailable; comparison rows follow that resolved order. Showing cards is a separate display choice, not the trigger for calculation or sorting. Preserve visible keyboard focus, semantic light/dark colours, accessible tab panels, and explicit disclosure state.

## Source

`app/(app)/calculator/page.tsx`, `components/calculator/LazyProbabilityCalculator.tsx`, `ProbabilityCalculator.tsx`, and `calculator.module.css`; calculation and parsing in `lib/probability-calculator/` and `lib/decks/deck-list-parse.ts`; shared `SegmentedControl`, `DeckListVisualGrid`, `CopyDeckListButton`, Pokémon options, and Deck List sorting.
