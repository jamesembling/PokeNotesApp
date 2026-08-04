import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("/logs/[id] server-renders the primary summary instead of the client detail API", () => {
  const page = source("app/(app)/logs/[id]/page.tsx");

  assert.match(page, /getLogDetailSummaryById/);
  assert.match(page, /<BattleLogDetailShell/);
  assert.doesNotMatch(page, /BattleLogDetailClientPage/);
  assert.doesNotMatch(page, /log-detail-data/);
});

test("battle-log detail keeps raw body data out of the initial route and removes stale session cache", () => {
  const page = source("app/(app)/logs/[id]/page.tsx");
  const shell = source("components/ui/BattleLogDetailShell.tsx");

  assert.doesNotMatch(page, /getLogById/);
  assert.doesNotMatch(page, /getLogDetailBodyById/);
  assert.match(shell, /\/api\/log-detail-body/);
  assert.equal(existsSync(join(process.cwd(), "app/api/log-detail-data/route.ts")), false);
  assert.equal(existsSync(join(process.cwd(), "lib/client/log-detail-cache.ts")), false);
  assert.doesNotMatch(source("components/ui/LogsManager.tsx"), /warmLogDetailCache|sessionStorage|log-detail-data/);
});

test("deferred battle-log body failures leave loading state and provide a retry", () => {
  const shell = source("components/ui/BattleLogDetailShell.tsx");
  const view = source("components/ui/BattleLogDetailView.tsx");

  assert.match(shell, /Deferred battle-log body request failed/);
  assert.match(shell, /status: "error"/);
  assert.match(shell, /status: "retrying"/);
  assert.match(shell, /retryDeferredBody/);
  assert.match(shell, /bodyLoadFailed=\{deferredBodyStatus === "error"\}/);
  assert.match(shell, /getElementById\("battle-log-detail-body"\)\?\.focus\(\)/);
  assert.match(view, /Battle log details unavailable/);
  assert.match(view, /Your session expired/);
  assert.match(view, /Battle log no longer available/);
  assert.match(view, /aria-disabled=\{isBodyRetrying\}/);
  assert.match(view, /className="min-h-11"/);
  assert.match(view, /<Skeleton/);
});

test("battle-log detail defers linked deck list data out of the blocking route response", () => {
  const page = source("app/(app)/logs/[id]/page.tsx");
  const contextRoute = source("app/api/log-detail-context/route.ts");
  const shell = source("components/ui/BattleLogDetailShell.tsx");

  assert.doesNotMatch(page, /getDeckWithList|page\.logs\.detail\.linkedDeckList/);
  assert.match(contextRoute, /getDeckWithList/);
  assert.match(contextRoute, /linkedDeckListSortedCards/);
  assert.match(shell, /deferredContext\?\.linkedDeckListSortedCards/);
});

test("/logs/[id] loading state is visible to users and route timing", () => {
  const loading = source("app/(app)/logs/[id]/loading.tsx");

  assert.match(loading, /data-route-loading/);
  assert.doesNotMatch(loading, /return null/);
});

test("/decks/[id] uses read-model stats and only latest linked logs on first render", () => {
  const page = source("app/(app)/decks/[id]/page.tsx");

  assert.match(page, /getDeckLogStats/);
  assert.match(page, /getLatestLogsForDeck\(user\.id, (deck\.id|id), 5\)/);
  assert.doesNotMatch(page, /getAllLogsForDeck/);
});

test("/decks/[id] keeps full deck-list editor payload out of the initial client props", () => {
  const page = source("app/(app)/decks/[id]/page.tsx");
  const lazyButton = source("components/ui/LazyDeckListEditorButton.tsx");

  assert.match(page, /getDeckListRowPayload/);
  assert.match(page, /deckListId=\{deckList\.id\}/);
  assert.doesNotMatch(page, /deckList=\{deckList\}/);
  assert.match(lazyButton, /\/api\/deck-list/);
});

test("visual deck-list entry points open dialogs instead of separate pages", () => {
  const deckPage = source("app/(app)/decks/[id]/page.tsx");
  const lazyViewButton = source("components/ui/LazyDeckListViewButton.tsx");
  const tournamentPage = source("app/(app)/tournaments/[id]/page.tsx");

  assert.match(deckPage, /LazyDeckListViewButton/);
  assert.doesNotMatch(deckPage, /\/lists\/\$\{deckList\.id\}/);
  assert.match(lazyViewButton, /\/api\/deck-list/);
  assert.match(lazyViewButton, /DeckListViewDialog/);
  assert.match(tournamentPage, /DeckListViewDialog/);
  assert.doesNotMatch(tournamentPage, /<details/);
});

test("full related deck logs are fetched only from the opened dialog path", () => {
  const page = source("app/(app)/decks/[id]/page.tsx");
  const dialog = source("components/ui/DeckLinkedLogsDialog.tsx");
  const actions = source("app/(app)/decks/actions.ts");

  assert.doesNotMatch(page, /loadDeckLinkedLogsAction|getAllLogsForDeck/);
  assert.match(dialog, /loadDeckLinkedLogsAction/);
  assert.match(actions, /getAllLogsForDeck/);
});

test("dead sidebar profile endpoint and sidebar client fetch stay removed", () => {
  assert.equal(existsSync(join(process.cwd(), "app/api/sidebar-profile/route.ts")), false);
  assert.doesNotMatch(source("app/(app)/layout.tsx"), /sidebar-profile/);
  assert.doesNotMatch(source("components/ui/Sidebar.tsx"), /sidebar-profile|fetch\(/);
});

test("app and admin layouts share the same authenticated shell chrome", () => {
  const appLayout = source("app/(app)/layout.tsx");
  const adminLayout = source("app/(admin)/layout.tsx");
  const appShell = source("components/ui/AppShell.tsx");

  assert.match(appLayout, /<AppShell/);
  assert.match(adminLayout, /<AppShell/);
  assert.doesNotMatch(appLayout, /SidebarProvider|SidebarMobileTopbar|SidebarInset|<Sidebar/);
  assert.doesNotMatch(adminLayout, /SidebarProvider|SidebarMobileTopbar|SidebarInset|<Sidebar/);

  assert.match(appShell, /SidebarProvider/);
  assert.match(appShell, /SidebarMobileTopbar/);
  assert.match(appShell, /SidebarInset/);
  assert.match(appShell, /<Sidebar profile=\{profile\}/);
});

test("authenticated app routes cache verified Supabase claims briefly across hot navigations", () => {
  const auth = source("lib/auth.ts");

  assert.match(auth, /AUTH_CLAIMS_CACHE_TTL_MS/);
  assert.match(auth, /authClaimsCache/);
  assert.match(auth, /readCachedAuthClaims/);
  assert.match(auth, /writeCachedAuthClaims/);
});

test("/stats renders overview first and defers archetype matchups to the read-model API", () => {
  const page = source("app/(app)/stats/page.tsx");
  const apiRoute = source("app/api/stats-matchups/route.ts");
  const logsDb = source("lib/db/logs.ts");

  assert.match(page, /getLogStatsOverview/);
  assert.doesNotMatch(page, /getArchetypeMatchupStats/);
  assert.match(page, /<Suspense fallback=\{<StatsOverviewFallback \/>/);
  assert.match(page, /<StatsContent overviewPromise=\{overviewPromise\}/);
  assert.match(page, /<StatsTabsClient overview=\{overview\}/);
  assert.match(apiRoute, /getArchetypeMatchupStats/);
  assert.match(source("components/ui/StatsTabsClient.tsx"), /\/api\/stats-matchups/);
  assert.match(source("components/ui/StatsTabsClient.tsx"), /Opening coin toss W\/L/);
  assert.match(
    source("components/ui/StatsTabsClient.tsx"),
    /overview\.coinFlipsWon, overview\.coinFlipsLost/
  );
  assert.doesNotMatch(
    source("components/ui/StatsTabsClient.tsx"),
    /Total prize cards collected|W: you chose|Games mulliganed|Latest \{formatMetric\(damageTimeline\.length\)\} games|Tracked \{formatMetric\(overview\.trackedDamage\)\}/
  );
  assert.match(logsDb, /from\("user_archetype_matchup_stats"\)/);
  assert.doesNotMatch(logsDb, /from\("logs"\)[\s\S]{0,300}opponent_deck_slug[\s\S]{0,300}group/);
});

test("/logs streams its shell before the initial log window resolves", () => {
  const page = source("app/(app)/logs/page.tsx");

  assert.match(page, /<Suspense fallback=\{<LogsContentFallback \/>/);
  assert.match(page, /<LogsContent initialDataPromise=\{initialDataPromise\}/);
  assert.match(page, /getInitialLogsPageData/);
  assert.match(page, /const initialDataPromise = loadInitialLogsPageData\(user\.id\)/);
  assert.match(page, /measureServerCallWithTiming\("page\.logs\.initialData"/);
  assert.match(page, /<LogsWorkspaceClient stats=\{stats\} window=\{window\}/);
});

test("/logs limits detail prefetch to sustained row intent", () => {
  const manager = source("components/ui/LogsManager.tsx");
  const row = source("components/ui/LogRow.tsx");

  assert.match(manager, /DETAIL_ROUTE_PREFETCH_DWELL_MS/);
  assert.match(manager, /pendingDetailRouteWarm/);
  assert.match(manager, /clearTimeout\(pendingDetailRouteWarm\.current\.timeoutId\)/);
  assert.match(manager, /router\.prefetch\(href\)/);
  assert.match(row, /onPointerLeave=\{onCancelWarmDetailAssets\}/);
  assert.match(row, /onBlur=\{onCancelWarmDetailAssets\}/);
  assert.match(row, /prefetch=\{false\}/);
});
