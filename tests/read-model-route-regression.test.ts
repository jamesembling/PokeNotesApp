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
  assert.doesNotMatch(
    source("components/ui/LogsManager.tsx"),
    /warmLogDetailCache|sessionStorage|log-detail-data/
  );
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

test("/decks/[id] uses read-model stats without preloading linked logs", () => {
  const page = source("app/(app)/decks/[id]/page.tsx");

  assert.match(page, /getDeckLogStats/);
  assert.doesNotMatch(page, /getLatestLogsForDeck|getAllLogsForDeck/);
  assert.match(page, /DeckStrategyResourcesMenu/);
});

test("/decks/[id] keeps full deck-list editor payload out of the initial client props", () => {
  const page = source("app/(app)/decks/[id]/page.tsx");
  const resources = source("components/ui/DeckStrategyResourcesMenu.tsx");
  const lazyButton = source("components/ui/LazyDeckListEditorButton.tsx");

  assert.match(page, /getDeckListRowPayload/);
  assert.match(resources, /deckListId=\{deckList\.id\}/);
  assert.doesNotMatch(resources, /deckList=\{deckList\}/);
  assert.match(lazyButton, /\/api\/deck-list/);
});

test("visual deck-list entry points open dialogs instead of separate pages", () => {
  const deckPage = source("app/(app)/decks/[id]/page.tsx");
  const resources = source("components/ui/DeckStrategyResourcesMenu.tsx");
  const lazyViewButton = source("components/ui/LazyDeckListViewButton.tsx");
  const tournamentPage = source("app/(app)/tournaments/[id]/page.tsx");

  assert.match(deckPage, /DeckStrategyResourcesMenu/);
  assert.match(resources, /LazyDeckListViewButton/);
  assert.doesNotMatch(resources, /\/lists\/\$\{deckList\.id\}/);
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

test("sidebar profile loads outside the initial app response", () => {
  assert.equal(existsSync(join(process.cwd(), "app/api/sidebar-profile/route.ts")), true);
  assert.doesNotMatch(source("app/(app)/layout.tsx"), /sidebar-profile/);
  assert.doesNotMatch(source("components/ui/Sidebar.tsx"), /sidebar-profile|fetch\(/);
  assert.match(
    source("components/ui/DeferredSidebarAccount.tsx"),
    /fetch\("\/api\/sidebar-profile"/
  );
  assert.match(source("components/ui/DeferredSidebarAccount.tsx"), /openMobile/);
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
  assert.match(appShell, /<DeferredSidebarAccount[\s\S]*initialResult=\{initialProfileResult\}/);
  assert.doesNotMatch(appLayout, /loadAppShellProfile|getCurrentSidebarProfile|profilePromise/);
  assert.match(adminLayout, /initialProfileResult=\{\{/);
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
  const statsTabs = source("components/ui/StatsTabsClient.tsx");

  assert.match(page, /getLogStatsOverview/);
  assert.doesNotMatch(page, /getArchetypeMatchupStats/);
  assert.match(page, /<Suspense fallback=\{<StatsOverviewFallback \/>/);
  assert.match(page, /<StatsContent overviewPromise=\{overviewPromise\}/);
  assert.match(page, /<StatsTabsClient overview=\{overview\}/);
  assert.match(apiRoute, /getArchetypeMatchupStats/);
  assert.match(statsTabs, /\/api\/stats-matchups/);
  assert.match(statsTabs, /Opening coin toss W\/L/);
  assert.match(statsTabs, /overview\.coinFlipsWon, overview\.coinFlipsLost/);
  assert.doesNotMatch(
    source("components/ui/StatsTabsClient.tsx"),
    /Total prize cards collected|W: you chose|Games mulliganed|Latest \{formatMetric\(damageTimeline\.length\)\} games|Tracked \{formatMetric\(overview\.trackedDamage\)\}/
  );
  assert.match(statsTabs, /const MIN_MATCHUP_GAMES = 3/);
  assert.match(statsTabs, /useState\(false\)/);
  assert.match(statsTabs, /showAllMatchups \|\| matchup\.gamesPlayed >= MIN_MATCHUP_GAMES/);
  assert.match(statsTabs, /checked=\{showAllMatchups\}/);
  assert.match(statsTabs, /onCheckedChange=\{setShowAllMatchups\}/);
  assert.match(statsTabs, />Show all matchups<\/span>/);
  assert.match(logsDb, /from\("user_archetype_matchup_stats"\)/);
  assert.doesNotMatch(logsDb, /from\("logs"\)[\s\S]{0,300}opponent_deck_slug[\s\S]{0,300}group/);
});

test("/logs streams an immediate fallback and one shared data promise", () => {
  const page = source("app/(app)/logs/page.tsx");
  const loader = source("lib/server/logs-page-data.ts");
  const frame = source("components/ui/LogsWorkspaceFrame.tsx");
  const loading = source("app/(app)/logs/loading.tsx");

  assert.equal(existsSync(join(process.cwd(), "app/(app)/loading.tsx")), false);
  assert.equal(existsSync(join(process.cwd(), "app/(app)/logs/loading.tsx")), true);
  assert.match(loading, /<LogsLastKnownState \/>/);
  for (const segment of ["calculator", "deck-lists", "decks", "profile", "stats", "tournaments"]) {
    assert.equal(existsSync(join(process.cwd(), `app/(app)/${segment}/loading.tsx`)), true);
  }
  assert.match(page, /loadInitialLogsPageData/);
  assert.match(loader, /getCachedInitialLogsPageDataWithDiagnostics/);
  assert.match(page, /const initialDataPromise = measureServerCallWithTimeline/);
  assert.match(page, /<Suspense fallback=\{<LogsLastKnownStats \/>\}>/);
  assert.match(page, /<Suspense fallback=\{<LogsLastKnownContent \/>\}>/);
  assert.match(page, /initialDataPromise=\{initialDataPromise\}/);
  assert.match(page, /measureServerCallWithTimeline\(\s*"page\.logs\.initialData"/);
  assert.match(page, /phase="route-data-visible"/);
  assert.match(page, /candidate === "delay-1000"/);
  assert.match(page, /candidate === "delay-400"/);
  assert.match(page, /candidate === "shell-only"/);
  assert.match(page, /phase="route-data-parsed"/);
  assert.match(frame, /phase="route-shell-visible"/);
  assert.match(frame, /phase="route-shell-parsed"/);
  assert.match(frame, /title="Battle Logs"/);
  assert.match(frame, /<LazyImportLogButton/);
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
