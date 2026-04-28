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

test("/logs/[id] loading state is visible to users and route timing", () => {
  const loading = source("app/(app)/logs/[id]/loading.tsx");

  assert.match(loading, /data-route-loading/);
  assert.doesNotMatch(loading, /return null/);
});

test("/decks/[id] uses read-model stats and only latest linked logs on first render", () => {
  const page = source("app/(app)/decks/[id]/page.tsx");

  assert.match(page, /getDeckLogStats/);
  assert.match(page, /getLatestLogsForDeck\(user\.id, deck\.id, 5\)/);
  assert.doesNotMatch(page, /getAllLogsForDeck/);
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

test("/stats renders archetype matchup stats from the read model", () => {
  const page = source("app/(app)/stats/page.tsx");
  const logsDb = source("lib/db/logs.ts");

  assert.match(page, /getArchetypeMatchupStats/);
  assert.match(page, /Win % vs Archetypes/);
  assert.match(logsDb, /from\("user_archetype_matchup_stats"\)/);
  assert.doesNotMatch(logsDb, /from\("logs"\)[\s\S]{0,300}opponent_deck_slug[\s\S]{0,300}group/);
});
