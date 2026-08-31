---
version: 1
slug: "route-admin-dashboard"
primary_target: "route:/admin/dashboard"
related_targets: ["app/(admin)/admin/dashboard/page.tsx","components/ui/AdminPortalClient.tsx","components/ui/AdminUsersTable.tsx","components/ui/AdminRoleControls.tsx","components/ui/AdminDashboardLoadingState.tsx","components/ui/admin/admin.module.css","app/api/admin/dashboard/bootstrap/route.ts"]
---

# Admin Dashboard

## Purpose and mode

Operate. Let an administrator review account activity and content counts, change access levels, and inspect the imported catalog summary. Product language remains in `CONTEXT.md`; visual authority remains in `docs/design-system.md`.

## Built direction

Extend the approved Stats and Deck Strategy world inside the shared app shell: IBM Plex typography, neutral semantic foregrounds and surfaces, tabular numerals, open sections, and thin rules. A labelled Users, Pokémon Catalog, and Archetypes summary leads into Accounts and Roles. Preserve that order without enclosing cards, pills, decorative colour bars, or a separate admin palette.

The account ledger uses eight flat columns: User, PTCGL, Activity, Deck Strategies, Deck Lists, Tournaments, Battle Logs, and Access. Keep the four content counts as independent, right-aligned ledger columns. Identity leads with display name and email. Activity dates keep their own labels; role is plain Admin or User text beside the shared switch. Long names, emails, and usernames wrap, and count values remain complete and legible.

## Responsive layout

Measure available page width, including the space left by the app sidebar. Above 59rem, the ledger is an eight-column table. At 59rem or less, each account becomes a ruled four-column block. Identity spans the width; PTCGL and Access each occupy half of the next row. Activity spans the following row, with Last activity and Last login side by side. The four content counts share the final row, one per column, each with its value above its visible label. Table headers and row semantics remain accessible.

The three overview metrics share a row until 30rem or less. They then stack with labels and detail on the left, the complete total on the right, and rules between metrics. At 20rem or less, the content counts use two rows of two so their labels remain readable. The loading ledger has eight cells per account and preserves this hierarchy at the same thresholds.

## Data meaning and states

- Users reports the supplied account total with a separately labelled admin count. Pokémon Catalog and Archetypes report supplied catalog totals with their own Synced timestamp. These are source values, not a new health score or completeness claim.
- Activity distinguishes Last activity from Last login. Each content count retains its own Deck Strategies, Deck Lists, Tournaments, or Battle Logs label. Missing usernames show Not set; missing dates show Not available yet; missing display names show Unnamed user.
- Keep the bootstrap warning visible above the ledger in a ruled notice with semantic loss text. An empty result shows No accounts to display. A failed bootstrap retains the page header and an open Dashboard unavailable state with an alert and Try Again action.

## Role interaction contract

Each role switch has an account-specific accessible name and visible Admin or User text. Switching submits the existing role action immediately; there is no separate Save action. Disable the control during the update and whenever role updates are unavailable. Keep the unavailable-state explanation beside Accounts and Roles.

Announce Updating admin role... while pending. A failed action leaves the current role intact and displays an alert linked to the switch. A successful action triggers the existing dashboard refresh so the next bootstrap supplies the current role and totals. Preserve shared switch keyboard and focus behavior.

## Preserved access and data boundaries

Keep the static route shell and the single existing same-origin, no-store request to `/api/admin/dashboard/bootstrap`. The bootstrap checks the current user and admin role before loading account and catalog data. Its real 401 response routes the client to login; 403 routes a non-admin to Battle Logs. Role mutations independently retain the existing authenticated administrator checks. Presentation code must not replace or bypass these boundaries.

Retain the existing profile, overview, users, role-availability, and warning payloads, plus the route timing markers. No new query, account promotion, catalog operation, or role policy belongs to this visual treatment.

Read-only synthetic previews may exercise visual extremes without promoting the ordinary local user fixture. Keep any preview proxy outside the repository and treat its output as presentation evidence only. Verify authorization and role mutations separately against the real guarded paths; synthetic counts establish no live account totals, catalog health, or runtime performance.

## Source

`app/(admin)/admin/dashboard/page.tsx`, `components/ui/AdminPortalClient.tsx`, `AdminUsersTable.tsx`, `AdminRoleControls.tsx`, `AdminDashboardLoadingState.tsx`, and `admin/admin.module.css`; shared `AppShell`, `PageHeader`, `SectionHeader`, `ItemTitle`, and `Switch`. Private data and role behavior remain in the bootstrap route, existing Admin actions, and `lib/db/admin.ts`.
