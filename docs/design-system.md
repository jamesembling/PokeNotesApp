# Design System

This app uses a token-first design system. Page and feature code should choose intent through shared components and semantic variants, not restyle common UI patterns inline.

## Token Source

Design tokens live in `app/globals.css` and are exposed to Tailwind through `tailwind.config.ts`.

This document is the source of truth for design-system intent. `app/globals.css`
and `tailwind.config.ts` are the implementation. The root `design.md` file is a
compatibility pointer only.

Use semantic tokens:

- `--primary`, `--secondary`, `--muted`, `--border`, `--ring`
- `--color-win`, `--color-loss`, `--color-warning` for charts/dots/background ingredients
- `--color-win-strong`, `--color-loss-strong`, `--color-warning-strong` for normal status text
- `--control-*` for segmented controls
- `--button-*` for shared button interaction states
- `--choice-*` for choice-card/radio-card controls
- `--dialog-*` for app modal shells
- `--log-entry-*` and `--deck-card-*` for rollover behavior
- `--action-*` for battle-log action dots

Do not add raw page-level colors for common states. If a new repeated state is needed, add a semantic token first.

## Product Decisions

- Primary brand/action color is red through `--primary`.
- `--color-brand` is an alias for `--primary`; it is not a separate blue brand system.
- Primary button hover uses the shared `--button-primary-hover-*` tokens and intentionally inverts to a light surface with red text/border.
- Secondary and outline buttons use a white light-mode surface through the shared `Button` variants.
- Light-mode navigation uses an off-black sidebar/menu surface, not pure black.
- Desktop sidebar navigation collapses to an icon rail through the shared sidebar primitive; collapsed menu labels use tooltips.
- Admin routes use the same authenticated app shell and token contract as the app routes. There is no separate admin palette unless a future requirement adds one explicitly.
- Shared-log notices may use `--share-notice-*` tokens. The gradient is an allowed tokenized notice treatment, not a general-purpose decorative background.
- Page headers always show the shared bottom divider. Do not disable or recreate page-header dividers in page code.
- Primary red buttons are for page-level create/import/save actions. Detail-page edit/back actions and section-level add/view actions use outline or ghost intent unless they are the only primary action on that page.
- Normal muted/kicker text must meet WCAG AA on page, card, and muted surfaces in both themes. Normal status/destructive text uses the `*-strong` semantic tokens; base status colors are reserved for non-text chart and marker graphics.

## Mode Callouts

Responsive and theme-specific behavior belongs in shared primitives and tokens:

- Desktop page actions sit in `PageHeader.action` or `SectionHeader.actions` and use `PageActions` for wrapping, grouping, and width.
- Mobile page actions should use the same action component through `PageHeader.mobileAction` or `PageActions mobile="stack"`; do not duplicate local flex/button recipes in page code.
- Mobile dialogs with long scrollable forms should put their primary action in `AppDialogMobileFooter` so save/continue actions stay reachable above the safe area while the form body scrolls.
- App modal headers should use `AppDialogHeader` so mobile popup titles, full-width dividers, close-button spacing, and optional action slots stay consistent.
- Light and dark styles must be represented by semantic CSS variables in `app/globals.css`. Component and page code should consume those tokens through shared variants.
- If a pattern needs different mobile, desktop, light, or dark behavior, add that behavior to the shared component or token set first.

## Shared Components

Use these components for repeated app UI:

- `Button` from `components/shadcn/button` for actions.
- `PageActions` for page, detail, and section button groups.
- `SectionHeader` for repeated section title/action rows.
- `PageTitle`, `DetailTitle`, `SectionTitle`, and `ItemTitle` from `components/ui/Typography` for heading scale and semantic title styling.
- `SegmentedControl` for compact view switches, turn preference toggles, and two-to-five option tabs.
- `ChoiceCard` for large radio-card choices where each option needs explanatory content.
- `AppDialogContent` for app modal shells.
- `AppDialogHeader` for app modal title/description/action rows.
- `AppDialogFooter` for desktop dialog actions that belong below a scrollable form.
- `AppDialogMobileFooter` for persistent mobile dialog actions below a scrollable modal body.
- `Badge` variants for win, loss, warning, neutral, and action labels.
- `Card`, `PageHeader`, `PageWidth`, and existing shadcn primitives for structure.

Do not recreate these patterns with ad hoc `rounded-*`, `bg-*`, `border-*`, or `shadow-*` classes in page code.

## Typography Rules

- Page-level H1 text is owned by `PageHeader`, which uses `PageTitle`.
- Detail-page H1 text with sprites/actions uses `DetailTitle`.
- Repeated section headings use `SectionHeader` or `SectionTitle`.
- Card, tile, row, and list-entry names use `ItemTitle`.
- `CardTitle` is semantic by default and supports `as="h2"`, `as="h3"`, or `as="div"` when hierarchy requires it.
- Do not place raw heading recipes such as `text-[2rem]`, `sm:text-4xl`, or `.ui-section-title` in page/feature code. Add or extend a typography primitive instead.

## Rollover Rules

Rollover behavior is intentionally separated by pattern:

- Buttons own button hover and active states through `Button` variants.
- Log entries use `logEntryRolloverClassName` from `components/ui/rolloverStyles.ts`.
- Tournament entries use `tournamentEntryRolloverClassName` from `components/ui/rolloverStyles.ts`, which intentionally shares the deck rollover treatment.
- Deck cards, deck list rows, and deck matchup rows use `deckCardRolloverClassName` from `components/ui/rolloverStyles.ts`.

Log rollover may differ from the shared tournament-and-deck treatment, but every deployment of each pattern should use the matching shared utility. Shared rollover utilities should control container background, brightness, lift, shadow, and focus ring only; text color changes must be explicit component decisions.

Run `npm run design:audit` after UI changes. It checks for copied dialog shells, copied rollover utilities, direct tab/dialog primitives where app wrappers exist, weak status/destructive text classes, and undefined CSS tokens.

## Migration Rule

When touching an existing UI surface:

1. Prefer an existing shared component.
2. If a repeated pattern is missing, add a small app-level component in `components/ui`.
3. Back repeated visual values with tokens in `app/globals.css`.
4. Keep feature code responsible for data and intent, not visual recipes.

## Stats Surface

Stats uses a neutral broadcast analysis desk within the existing IBM Plex Sans and semantic surface system. These rules are specific to `/stats`; they do not replace the app-wide component contract.

- **Performance first.** A large all-time win rate and compact won/lost/played record occupy roughly one third of the desktop overview beside a dominant recent-form chart. Latest results follow, then the supporting damage, prize-taking, and opening-hand ledgers. Below 1024px, these sections stack in the same reading order; large record counts reflow onto their own full-width row without abbreviation. The loading layout preserves the section hierarchy.
- **Flat comparison.** Use open space, thin rules, tabular numerals, and a neutral chart line. Results use explicit W/L/unknown text. Keep the analytical content free of cards, pills, colored outcome bars, and decorative imagery. Matchups remains a flat table with right-aligned numbers and wrapping archetype names on mobile.
- **Separate windows.** All-time record and supporting totals remain distinct from bounded recent history. Label the recent summary and rolling chart clearly, preserve unknown-result disclosures, and keep the calculation explanation available.
- Stats opts into `SegmentedControl appearance="line"` for underlined Overview/Matchups tabs. The shared component's default segmented appearance is unchanged. Matchup search uses a visible label and underline; its sample-size option uses a square checkbox. Keep keyboard focus visible for tabs, chart, search, checkbox, and sort controls.

The route-specific data windows, interaction states, and sources are recorded in [the Stats surface brief](../.impeccable/surfaces/route-stats.md).

## Deck Strategy and Matchup Notes Surfaces

`/decks`, `/decks/[id]`, and `/decks/[id]/matchups/[matchupId]` extend Stats' neutral language into a working notebook. This is a scoped treatment, not a replacement for the app-wide component contract.

- **Open sections.** Use thin rules, shared IBM Plex typography, semantic foregrounds, and flat rows. Keep record values and save states explicitly labelled and neutral; errors retain the semantic loss text. Do not wrap strategy content in nested cards, pills, or coloured outcome bars. Existing archetype sprites remain functional identifiers.
- **Readable notes.** Preserve line breaks and wrap long text inside each row. Keep category titles and counts visible, with note actions beside the text. Use the existing bounded Quick Capture field and shared modal controls; do not turn the workspace into a wall of empty textareas.
- **Room before columns.** Collection columns respond to available content width, with numerical columns centred, Deck left-aligned, and Updated right-aligned. Matchup Notes uses three columns only when its own content container reaches 60rem; otherwise it remains one column. Preserve the intentional mobile category accordions and the Deck Strategy four-note reveal.
- **Flat navigation and states.** List/Tiles opts into underlined `SegmentedControl` navigation. Entire collection entries and matchup links are keyboard-accessible links ending in chevrons. Tiles remain open ruled blocks. Collection loading and empty states use the same flat structure.
- **Keep editing meaning visible.** Turn preference stays inline. Matchup Notes retains its optional First/Second/Not set choice, six distinct categories, separate header and note save states, and explicit add, edit, reorder, and phase-move actions. Opening Add or using a phase-move menu action exposes its destination category.

Responsive details and the preserved editing contracts are recorded in [the Deck Strategy surface brief](../.impeccable/surfaces/route-decks.md).

## Calculator Surface

`/calculator` extends the neutral analytical language into an open probability workspace. This treatment is scoped to the Calculator; shared forms, buttons, typography, and page-header dividers retain their app-wide contracts.

- **Inline input, then evidence.** Start with a visibly labelled Deck List field beside a short method guide. Results replace the editor with deck composition, opening-hand probabilities, mulligan streaks, and card comparisons. Keep import and analysis free of enclosing cards, pills, decorative artwork, and outcome-coloured probability bars.
- **Explain each percentage.** Use prominent tabular numerals with explicit labels and denominators. Distinguish all opening hands from playable hands, and state that prize odds use six cards from a 60-card deck without adjusting for the opening hand. Keep parsing and deck-count warnings beside the results in semantic error text.
- **Flat responsive comparison.** Use thin rules, wrapping card names, and centred numerical columns on desktop. At 40rem or less of available content width, each card becomes a full-width identity row above its labelled values, while table semantics remain available. Opening-hand summaries must fit complete percentages, including `100.00%`, without colliding with adjacent values.
- **Quiet navigation and artwork.** Setup/Prizing opts into underlined `SegmentedControl` navigation. Small sprites identify Pokémon; the full Deck List graphic is hidden until Show cards is selected. Copy and edit actions refer to the last calculated input.
- **Preserve the workflow.** The list is used only for the current calculation and is not saved. Keep edit/cancel/clear, input errors, warning results, keyboard focus, and the flat responsive loading layout intact. This presentation does not redefine the calculation model or shared Deck List ordering.

The calculation meaning, responsive thresholds, and loading/state contracts are recorded in [the Calculator surface brief](../.impeccable/surfaces/route-calculator.md).

## Deck List Profile Surface

`/deck-lists/[listId]` and `/decks/[id]/lists/[listId]` extend the approved Stats, Deck Strategy, and Calculator language into a shared Deck List profile. This is an incumbent-world extension; shared typography, page headers, buttons, dialogs, and card rendering retain their existing contracts.

- **Cards lead.** Place a compact, labelled composition row and Copy List Text above the real card artwork. Keep the surrounding profile open, with neutral semantic colours, IBM Plex typography, tabular quantities, and thin rules. Do not add enclosing cards, pills, decorative colour bars, or substitute artwork.
- **Room before the rail.** Show List details, Deck Strategy, and Notes in a 16rem right rail only when the profile has at least 64rem of available width. Otherwise, put those details below the artwork. The artwork grid responds to its own width: four columns by default, six at 36rem, and eight at 60rem. These are content-container thresholds, including the space left by the app sidebar.
- **Readable record details.** Keep Format, Date, and Created by explicitly labelled, with Not set for unavailable values. Preserve note line breaks and wrapping. Association status is a plain strategy link or Standalone list; editing the association lives in a labelled native disclosure on the first-class route.
- **Shared, deliberate actions.** Keep Edit List and the pale-red Delete List in the shared page-action group. Delete opens the shared confirmation dialog and returns focus to its trigger when dismissed. The nested strategy route retains Edit List and Back to Deck. Legacy-only records retain their explanation and editing path without exposing delete or association controls.
- **Preserve record meaning.** Composition reports stored card quantities, including Uncategorised when needed; it is not a legality claim. Copy uses the original list text. Preserve current association identity, save-version checks, authentication, queries, shared ordering, and image behavior. Delete copy promises that Battle Log and Tournament records are kept, not that Tournament Deck List Snapshots are implemented by this surface.

The responsive layout, route-specific actions, empty states, and record boundaries are recorded in [the Deck List profile surface brief](../.impeccable/surfaces/route-deck-list-profile.md).
