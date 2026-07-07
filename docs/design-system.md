# Design System

This app uses a token-first design system. Page and feature code should choose intent through shared components and semantic variants, not restyle common UI patterns inline.

## Token Source

Design tokens live in `app/globals.css` and are exposed to Tailwind through `tailwind.config.ts`.

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

## Shared Components

Use these components for repeated app UI:

- `Button` from `components/shadcn/button` for actions.
- `SegmentedControl` for compact view switches and two-to-five option tabs.
- `ChoiceCard` for large radio-card choices such as turn preference.
- `AppDialogContent` for app modal shells.
- `Badge` variants for win, loss, warning, neutral, and action labels.
- `Card`, `PageHeader`, `PageWidth`, `StatCard`, and existing shadcn primitives for structure.

Do not recreate these patterns with ad hoc `rounded-*`, `bg-*`, `border-*`, or `shadow-*` classes in page code.

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
