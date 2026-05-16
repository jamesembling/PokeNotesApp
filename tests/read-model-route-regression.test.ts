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

test("authenticated app routes cache verified Supabase claims briefly across hot navigations", () => {
  const auth = source("lib/auth.ts");

  assert.match(auth, /AUTH_CLAIMS_CACHE_TTL_MS/);
  assert.match(auth, /authClaimsCache/);
  assert.match(auth, /readCachedAuthClaims/);
  assert.match(auth, /writeCachedAuthClaims/);
});

test("/stats renders archetype matchup stats from the read model", () => {
  const page = source("app/(app)/stats/page.tsx");
  const apiRoute = source("app/api/stats-matchups/route.ts");
  const logsDb = source("lib/db/logs.ts");

  assert.match(page, /getArchetypeMatchupStats/);
  assert.match(page, /<StatsTabsClient matchups=\{matchups\} overview=\{overview\}/);
  assert.match(apiRoute, /getArchetypeMatchupStats/);
  assert.match(source("components/ui/StatsTabsClient.tsx"), /\/api\/stats-matchups/);
  assert.match(logsDb, /from\("user_archetype_matchup_stats"\)/);
  assert.doesNotMatch(logsDb, /from\("logs"\)[\s\S]{0,300}opponent_deck_slug[\s\S]{0,300}group/);
});
