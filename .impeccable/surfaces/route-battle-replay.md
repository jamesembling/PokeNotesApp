---
version: 1
slug: "route-battle-replay"
primary_target: "route:/replays"
related_targets: ["route:/replays/[id]", "app/(app)/replays/page.tsx", "app/(app)/replays/[id]/page.tsx", "components/battle-replay/BattleReplay.tsx", "components/battle-replay/battle-replay.module.css", "lib/battle-replay/compiler.ts", "components/ui/Sidebar.tsx"]
---

# Battle Replay

## Purpose and mode

Operate. Help the account owner choose one saved Battle Log and follow its recorded actions on the approved visual board. Battle Replay (Beta) is a derived read view, not a saved record, editor, simulator, or public share. Product meaning lives in `PRODUCT.md` and `CONTEXT.md`; visual authority remains in `docs/design-system.md`. Preserve the reviewed prototype composition and assets rather than opening a new identity exercise.

## Built direction

The `/replays` picker sits inside the authenticated app shell with the shared collection header and flat whole-row links. Each row identifies the matchup and actual saved date, result, format, and turns. Latest games and Older games retain the existing bounded owner-log window. Keep loading and empty states in that hierarchy, with a direct path to Battle Logs.

The `/replays/[id]` viewer uses the wide shared page container. Its page header provides View Battle Log and Choose another game. Replay metadata leads into the approved timeline/board composition. The opponent is above the player; Prize cards sit left, Active Pokémon centrally, Bench beneath Active, and Deck/Discard piles right. Preserve hands, player-owned stadium placement, transaction overlays, evolution stacks, condition markers, attached Energy, damage, coin tosses, and KO motion. Keep the existing neutral app surfaces and typography around this functional board; replay-specific card treatment does not become a system for unrelated pages.

The sidebar entry sits beside Battle Logs. Beta remains visible in expanded/mobile navigation and uses the active navigation foreground when selected. The explicit accessible link name and icon-rail tooltip are Battle Replay (Beta). Preserve the existing Friends pending-request dot and its separate count description.

## Responsive bounds

Use the named `replay` inline-size container so layout responds to the actual width left by the sidebar. Above 68rem, timeline and board are side by side. At 68rem or less, the board and controls lead and the timeline follows with a bounded scrolling list. At 44rem or less, matchup metadata reflows. At 40rem or less, preserve the approved mobile Active-card size, prizes/field/piles layout, full-width Bench, and enlarged known hand cards. The pile-width custom property remains local and responsive.

Hand rows scroll within their available width and reserve room for the reviewed hover/focus lift. Energy sizing, health spacing, and all later mobile overrides remain part of the approved baseline. The discard sheet is portaled outside the replay container and therefore retains its separate 44rem viewport breakpoint. Card preview remains bounded by viewport width and dynamic height.

## Source and privacy contract

Both routes require the current user; selected logs are read through the existing account-scoped `getLogById` path. The picker uses the current owner's log window. Replay compilation receives the saved source sections and produces a serializable program, one event and resulting frame per recorded action plus an initial frame. Events retain `sourceSectionIndex` so both players' same-numbered turns remain distinct. The client receives frames and events without executable mutation functions. No personal pilot fixtures, sample-player selectors, external iframe, new database table, or schema migration belongs to this integration.

Replaying never changes or resaves the Battle Log. IDs and position query values are bounded before use; unavailable/non-owner records remain unavailable. Replay is owner-only and does not expand shared-log, Friendship, or Player Profile access.

## Uncertainty and artwork

Keep recorded actions distinct and traceable. Unknown HP and hand, deck, or Prize counts remain labelled; hidden cards stay hidden. In the enlarged preview, HP unknown sits on an opaque `--card` surface with `--card-foreground` text, a `--border` stroke, and `--dialog-radius-compact`; its legibility must not depend on the artwork or overlay beneath it. Partial reconstruction shows its diagnostic explanation, affected incomplete zones, unknown accumulated damage, and unresolved action notes alongside the recorded source. Each source line is applied transactionally: an unresolved line invalidates the affected knowledge while independently established transitions in the same action remain visible. Contradictory counts become unknown rather than preventing a later explicit named movement. Later frames retain uncertainty until the source re-establishes the affected fact. An unsupported log offers its original written Battle Log instead of presenting an invented board.

Unambiguous existing public catalog rows may classify a recorded Ability, attack or Trainer type and establish an explicitly stated single movement origin. Missing, conflicting or unsupported effect text leaves that origin unknown. This does not execute card text or infer an unrecorded effect. Catalog lookup is bounded and failure leaves the source available with unresolved changes.

Display the actual saved date and result. Existing card artwork may be a representative printing, with a visible notice and no legality assertion. Missing mappings may use a bounded public printing lookup for already visible names, requiring the complete canonical card name to match. Lookup and image failures show the card name and Artwork unavailable on the board, hand, transaction, discard, and enlarged preview surfaces. Attached Energy retains each recorded type and count when grouped; Special Energy is never assigned a guessed basic type. Official rulebook Energy symbols and Burn/Poison markers retain their provenance; the custom Sleep Zzz and existing prototype coin artwork retain their documented origins. Paralyzed and Confused use distinct labelled icon markers.

## Interaction and states

Preserve action and turn stepping, Play/Pause, Restart, the range scrubber, and bounded position deep links. Turn controls stop at each source section's first recorded action rather than combining the players' same-numbered turns. Seeking pauses playback. Opening a preview or discard inspection also pauses playback. Dismissing either returns focus to its originating control while that control remains present. A preview opened inside the discard gallery returns focus to that gallery card; dismissing the gallery then returns focus to the board's discard control. Changing the selected saved log remounts the keyed renderer and resets playback, dialogs, and position. A selected timeline action can bring the board into view in the stacked layout.

Use shared Buttons, typography, and `AppDialogContent`, with visible focus and accessible labels. Current-action updates use a polite live region. Reduced motion keeps state transitions understandable without the full animation. Error recovery uses the installed Next error boundary API and retains links to the picker or original log. Loading, empty, partial, unsupported, and unavailable states are distinct.

## Sources

Routes and loading/error/not-found boundaries in `app/(app)/replays/`; the reviewed board extraction in `components/battle-replay/`; compilation, types, preview helpers, conditions, and source flattening in `lib/battle-replay/`; owner log reads in `lib/db/logs.ts`; menu and detail actions in `components/ui/Sidebar.tsx` and `BattleLogDetailShell.tsx`; assets and provenance in `public/images/battle-replay/`.
