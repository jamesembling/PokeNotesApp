---
version: 1
slug: "route-tournaments"
primary_target: "route:/tournaments"
related_targets: ["app/(app)/tournaments/page.tsx","app/(app)/tournaments/loading.tsx","components/ui/TournamentSummaryList.tsx","components/ui/TournamentEditorDialog.tsx","components/ui/TournamentCompetitionBadge.tsx","components/ui/TournamentsLoadingState.tsx","components/ui/tournament/collection.module.css","components/ui/LazyTournamentEditorButton.tsx","lib/tournaments/options.ts"]
---

# Tournament Collection

## Purpose and mode

Operate. Help a competitive player find a Tournament, inspect its placement and round record, open the event, or create one. Product language remains in `CONTEXT.md`; visual authority remains in `docs/design-system.md`.

## Built direction

Extend the approved Stats, Deck Strategy, and Deck List collection language: shared IBM Plex typography, neutral semantic foregrounds and surfaces, tabular records, open rows, and thin rules. The shared page header retains the lazy + New Tournament outline action. Loaded and loading headers omit their divider because the collection owns the strong top rule. The collection retains the event count and Most recent first text without a repeated section title. Keep this landing-page collection free of enclosing or nested cards, tables, pills, and decorative colour bars; placement and record use normal neutral text. These constraints do not restyle shared editors, actions, or the schema notice.

Each entry is one complete link in the Saved Tournaments list, ending in a chevron. Names and date/category metadata wrap within the identity column. Competition badges remain supporting event marks rather than a new component vocabulary; use a theme-specific source when the same badge artwork needs separate light- and dark-mode treatment. Keep neutral hover, visible keyboard focus, semantic light/dark colours, and reduced-motion handling. The collection adds no filters or view switch.

## Responsive layout

Measure available page-container width, including the space left by the app sidebar. At 40rem or wider, show five columns: Event, Placement or judge Role, player Record, Points, and chevron. Event is left-aligned and the metrics are centred; headings, values, and loading placeholders share those alignments. The shared Points heading uses CP/PP, while each row exposes the full role-specific label to assistive technology. The visual heading row is separate from the accessible metric labels retained within each link.

Below 40rem, hide the visual heading row. Event identity spans the row, with the chevron beside it. Player rows follow with Placement, Record, and Points; judge rows use Role across the first two metric columns and Points in the third. All metrics retain visible, left-aligned labels. Preserve complete values and wrapping names and metadata without horizontal overflow. Loading uses the same breakpoint and column structure.

## Event and navigation contracts

- The subtitle uses `formatLongDayDate(tournament.dateFrom)` and the optional location. Keep the existing start-date display, including for multi-day events; the competition badge carries category identity and this surface does not introduce a date range.
- Placement uses the existing label helper, falling back to No placement. Record uses `getTournamentRecord(tournament.rounds)`, preserving its round-level aggregation, special-result interpretation, and omission of a zero tie count.
- Player records label and display Championship Points (CP). Judge records label and display Professor Points (PP), alongside the judge Role in place of player Placement and Record. The editor applies the same role-aware label and field without changing the surrounding form layout.
- Competition badges keep their category-specific accessible name. Prerelease uses the standard asset in light mode and the dedicated dark asset in dark mode so the mark remains legible without adding a badge variant API to the surface.
- Preserve the current-user requirement and account-scoped `getTournamentSummaries` read. Keep the returned order: descending `date_from`, then descending `created_at`. Presentation adds no client sorting or filtering.
- Complete row links open `/tournaments/[id]` with `prefetch={false}`. This layout does not alter Tournament identity, ownership, rounds, Deck List associations, or preserved snapshots.

## State and loading contracts

Keep the existing lazy editor and option-loading behavior. An empty collection displays No tournaments saved yet and its existing guidance while the page action remains available.

The route loading state preserves the shared page header and action placeholder. Both route and streamed-content loading use a count/order placeholder, the collection rule, responsive column headings, and three row skeletons without a repeated section title. Announce Loading Tournaments through the busy status region and hide decorative skeleton content from assistive technology.

Preserve `requireUser`, the existing measured data read, proxy-auth and route-data timing markers, and the Suspense streaming boundary. Retain the non-production `TournamentSchemaNotice` unchanged, the production Tournament tracking is temporarily unavailable response, and rethrowing of other errors.

Render the summary list on the server; competition badges remain server-rendered and the lazy editor remains a client component without a list-wide client boundary. Row grids retain `content-visibility: auto` and the existing 88px intrinsic-size estimate. These implementation boundaries are not new measured runtime performance or browser-QA claims.

## Source

`app/(app)/tournaments/page.tsx` and `loading.tsx`; `components/ui/TournamentSummaryList.tsx`, `TournamentEditorDialog.tsx`, `TournamentCompetitionBadge.tsx`, `TournamentsLoadingState.tsx`, and `tournament/collection.module.css`; `lib/tournaments/options.ts`; existing `LazyTournamentEditorButton`, `TournamentSchemaNotice`, `PageHeader`, `PageActions`, shared typography, date/placement/record helpers, and `lib/db/tournaments.ts` reads.
