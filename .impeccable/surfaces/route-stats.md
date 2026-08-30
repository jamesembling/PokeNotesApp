---
version: 1
slug: "route-stats"
primary_target: "route:/stats"
related_targets: ["app/(app)/stats/page.tsx","components/ui/StatsTabsClient.tsx","components/ui/stats/PerformanceChart.tsx","components/ui/stats/StatsMatchups.tsx","components/ui/stats/stats.module.css","components/ui/stats/chart.module.css","components/ui/stats/matchups.module.css","lib/stats/performance.ts"]
---

# Stats

## Purpose and mode

Operate. Help a competitive player understand overall performance, inspect recent form, and identify opponent archetypes worth reviewing in Battle Logs. Product truth remains in `PRODUCT.md` and `CONTEXT.md`; visual authority remains in `docs/design-system.md`.

## Built direction

Neutral broadcast analysis desk: existing IBM Plex Sans, semantic foregrounds and surfaces, strong numerical hierarchy, open space, and thin rules. The desktop overview gives roughly one third to the all-time record and two thirds to recent form. Latest results sit beneath both; damage exchange, prize taking, and opening hands form a secondary ledger row. Below 1024px, the page stacks record, form, results, and supporting ledgers; large record counts reflow onto their own full-width row without abbreviation. Retain the section order in loading states.

Keep analytical content free of cards, pills, colored outcome bars, decorative imagery, and new fonts. Overview/Matchups uses the opt-in underlined `SegmentedControl` appearance. Matchups is a flat table with existing archetype sprites, wrapping names, right-aligned numerals, labeled search, and a square sample-size checkbox.

## Data meaning

- All-time totals come from the overview query independently of recent history. Per-game averages divide recorded totals by all saved games; attack damage excludes damage counters.
- Recent form shows at most 50 chart points. Each point uses up to 20 consecutive games, excluding unknown outcomes from its win-rate denominator. The route requests up to 69 recent games so the first visible point can include its preceding window. The headline rate summarizes the latest 50 available games; an all-time comparison appears after 20 known results.
- The latest 10 outcomes read oldest to newest as W, L, or an unknown-result dash. Overview and recent win rates exclude unknown results; coin-toss rates exclude unknown tosses. Missing history and truncated windows are disclosed without changing all-time totals.
- Matchups preserves its existing all-games win-rate denominator and states this beneath the table. Unidentified opponents are excluded. The default sample threshold is three games; “Show all matchups” includes smaller samples and labels them.

## Interaction and states

The chart defaults to the latest point and supports pointer scrubbing plus arrow, Home, and End keys, with the selected game, date, record, and rolling rate exposed in text. Gaps represent windows with no known results; short histories show progress toward 20 games.

Matchups loads on first opening and supports retry after a failed request. Search and sortable Games, Record, and Win rate headings refine the table; default sorting is descending win rate. Preserve empty-record, no-match, and small-sample states, visible keyboard focus, reduced-motion behavior, and light/dark semantic colors.

## Source

`app/(app)/stats/page.tsx`, `components/ui/StatsTabsClient.tsx`, `components/ui/stats/`, `components/ui/SegmentedControl.tsx`, and `lib/stats/performance.ts`.
