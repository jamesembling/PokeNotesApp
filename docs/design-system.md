# Design System

This app uses a token-first design system. Page and feature code should choose intent through shared components and semantic variants, not restyle common UI patterns inline.

## Token Source

Design tokens live in `app/globals.css` and are exposed to Tailwind through `tailwind.config.ts`.

This document is the source of truth for design-system intent. `app/globals.css`
and `tailwind.config.ts` are the implementation. The root `design.md` file is a
compatibility pointer only.

Use semantic tokens:

- `--primary`, `--secondary`, `--muted`, `--border`, `--ring`
- `--color-win`, `--color-loss`, `--color-warning`
- `--control-*` for segmented controls
- `--button-*` for shared button interaction states
- `--choice-*` for choice-card/radio-card controls
- `--dialog-*` for app modal shells
- `--log-entry-*`, `--tournament-entry-*`, and `--deck-card-*` for rollover behavior
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
- Canvas export artwork uses an isolated export palette in `lib/probability-calculator/index.ts` because CSS variables are not available inside generated image drawing.
- Page headers always show the shared bottom divider. Do not disable or recreate page-header dividers in page code.
- Primary red buttons are for page-level create/import/save actions. Detail-page edit/back actions and section-level add/view actions use outline or ghost intent unless they are the only primary action on that page.

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
- `AppDialogMobileFooter` for persistent mobile dialog actions below a scrollable modal body.
- `Badge` variants for win, loss, warning, neutral, and action labels.
- `Card`, `PageHeader`, `PageWidth`, `StatCard`, and existing shadcn primitives for structure.

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
- Tournament entries use `tournamentEntryRolloverClassName` from `components/ui/rolloverStyles.ts`.
- Deck cards, deck list rows, and deck matchup rows use `deckCardRolloverClassName` from `components/ui/rolloverStyles.ts`.

Log, tournament, and deck rollover styles may differ from each other, but every deployment of each pattern should use the matching shared utility. Shared rollover utilities should control container background, brightness, lift, shadow, and focus ring only; text color changes must be explicit component decisions.

Run `npm run design:audit` after UI changes. It checks for copied dialog shells, copied rollover utilities, direct tab/dialog primitives where app wrappers exist, and undefined CSS tokens.

## Migration Rule

When touching an existing UI surface:

1. Prefer an existing shared component.
2. If a repeated pattern is missing, add a small app-level component in `components/ui`.
3. Back repeated visual values with tokens in `app/globals.css`.
4. Keep feature code responsible for data and intent, not visual recipes.
