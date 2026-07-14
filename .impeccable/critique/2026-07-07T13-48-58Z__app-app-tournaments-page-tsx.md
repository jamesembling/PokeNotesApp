---
target: critique - is the tournament page any good
status: historical-snapshot
total_score: 23
p0_count: 0
p1_count: 2
timestamp: 2026-07-07T13-48-58Z
slug: app-app-tournaments-page-tsx
---
Method: dual-agent (A: 019f3cd2-6dd3-75e0-97b1-83edb1c2c111 · B: 019f3cd2-9276-7110-8765-e526dbba33e6)

> **Document status:** Point-in-time critique from 7 July 2026, not the current product backlog.
> Follow-up verified against the repository on 14 July 2026:
>
> - The mobile action-visibility issue is fixed: `TournamentEditorDialog` uses `AppDialogMobileFooter`. Whether the initial form should contain fewer fields remains a product decision.
> - The populated-history scaffolding issue is fixed: `TournamentSummaryList` now has a labelled “Tournament history” section, event count, “Most recent first” context, and desktop column labels.
> - Search/filter/grouping is still absent; the empty state remains deliberately small; production schema-error copy still mentions contacting the app owner; mobile rows still hide sprites; and the duplicate component-level empty state and skeleton-radius mismatch remain.
>
> Preserve the score and findings below as evidence of the original review. Use current code and the repository issue tracker when deciding what remains actionable.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Empty state confirms absence but does not preview what tournament tracking will contain. |
| 2 | Match System / Real World | 2 | Uses tournament language, but lacks event-day concepts like active event, round progress, deck choice, and matchup history. |
| 3 | User Control and Freedom | 3 | Clear page CTA and navigation; creation dialog is recoverable, but mobile save is not visible early. |
| 4 | Consistency and Standards | 4 | Strong use of PageHeader, PageActions, app shell, tokens, and tournament rollover utilities. |
| 5 | Error Prevention | 2 | Creation flow asks for many fields immediately; optional vs required intent is not introduced from the page. |
| 6 | Recognition Rather Than Recall | 2 | Rows expose name/date/category/placement/record, but lack labels or framing. |
| 7 | Flexibility and Efficiency | 2 | Rows open directly, but there is no search, filter, grouping, sorting, or continue-active-event path. |
| 8 | Aesthetic and Minimalist Design | 3 | Restrained and clean, but the empty state crosses into absence. |
| 9 | Error Recovery | 2 | Schema-missing fallback exists, but recovery copy is generic and owner-centric. |
| 10 | Help and Documentation | 1 | No inline teaching beyond one short empty-state sentence. |
| **Total** | | **23/40** | **Solid shell, thin product surface** |

## Anti-Patterns Verdict

This does not look obviously AI-generated. It avoids fan-site energy, decorative Pokemon theming, generic gradient dashboards, glass, and oversized hero-metric patterns. The issue is product usefulness, not visual slop.

LLM assessment: restrained, sober, and consistent with the app shell. The page feels more like a CRUD archive than a competitive tournament workspace, especially for first-time and mobile event-day use.

Deterministic scan: CLI detector returned zero findings for `app/(app)/tournaments/page.tsx` and `components/ui/TournamentSummaryList.tsx`.

Browser evidence: authenticated browser injection succeeded and logged five runtime warnings: `layout-transition` x3, `line-length` x1, `nested-cards` x1. These appear to be app-shell/framework or weak broad-container signals rather than tournament-page source issues. The CLI scan did not corroborate them.

Visual overlays: runtime overlays were generated in the authenticated automation page, but no durable user-visible overlay remains after cleanup.

## Overall Impression

The tournament page is clean enough to trust, but not useful enough to feel like a serious tournament tool yet. The biggest opportunity is to make it explain and support the tournament workflow: before event, during rounds, and after final placement.

## What's Working

1. The page respects the product identity: off-black navigation, red primary action, neutral surfaces, and no novelty Pokemon decoration.
2. Shared component vocabulary is solid: `PageHeader`, `PageActions`, app shell, and row rollover utilities are consistent with the design system.
3. Populated tournament rows choose the right scan targets: event name, date/category, placement, and record.

## Priority Issues

**[P1] Empty state undersells the tournament workflow**

Why it matters: the empty page only says "Start with an event..." and leaves most of the viewport blank. It does not show that this feature tracks deck choice, rounds, placement, and notes.

Fix: replace the bare empty state with a compact operational empty state: one sentence plus 2-3 concrete workflow points or a small preview row showing the future list anatomy. Keep the primary CTA.

Suggested command: `$impeccable onboard app/(app)/tournaments/page.tsx`

**[P1] Mobile creation flow is heavy from a cold start**

Why it matters: a player may create a tournament while standing at an event. The dialog asks for many fields up front, and the primary save action is not visible early on mobile.

Fix: make initial creation feel like a fast setup: event name, format/category, date, and deck. Treat placement as post-event or clearly optional. Add a sticky mobile dialog footer for the save action.

Suggested command: `$impeccable harden components/ui/TournamentEditorDialog.tsx`

**[P2] Populated history lacks scan scaffolding**

Why it matters: placement and record are useful, but without a section header, count, sort context, or column labels, users infer meaning instead of scanning confidently.

Fix: add a compact section header above the list, e.g. "Tournament history" plus count and "Most recent first." On desktop, consider subtle labels for Event, Placement, and Record.

Suggested command: `$impeccable layout components/ui/TournamentSummaryList.tsx`

**[P2] No power-user controls for a growing history**

Why it matters: once the user has many events, a flat list becomes a memory test. Competitive players will want to find Regionals, compare formats, review deck performance, or continue an active event.

Fix: add restrained controls when data exists: search, category/format filter, and eventually Active / Upcoming / Completed grouping if the model supports it.

Suggested command: `$impeccable shape tournament history controls`

**[P3] Error recovery copy is generic and owner-centric**

Why it matters: "contact the app owner" sounds internal and undermines product trust.

Fix: use user-centered recovery: "Tournament data could not load. Refresh, or try again in a minute." Keep owner/admin language out of normal production UI.

Suggested command: `$impeccable clarify app/(app)/tournaments/page.tsx`

## Persona Red Flags

**Power User**: No visible search/filter/sort. With 30 events, the user cannot quickly isolate League Cups, a specific deck, or strong finishes.

**First-Timer**: The empty state does not show what a saved tournament becomes. They see "New Tournament," but not the round, placement, deck, or notes workflow.

**Mobile Tournament Player**: The creation form feels too long for event-day setup, and the save action starts below the first mobile viewport.

## Minor Observations

- The populated row hides deck sprites on mobile, removing a fast recognition cue.
- The skeleton fallback uses `rounded-2xl`, while tournament rows use `rounded-[10px]`.
- `TournamentSummaryList` still contains its own empty state even though the page handles empty tournaments first, so duplicate empty-state copy can drift.
- Browser detector warnings were mostly shell/framework signals, not actionable tournament source findings.

## Questions to Consider

1. What would this page show if it assumed the user is at a tournament right now, not browsing an archive?
2. Should placement be part of creation, or is it actually an end-of-event outcome?
3. What is the one tournament insight this page should surface without opening details: best finish, latest record, active event, deck used, or format trend?
4. Would a serious player trust this more if the empty state looked like an analytics workflow preview rather than a blank CRUD page?
