import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { getSafeRedirectPath, withRefreshToken } from "@/lib/server/action-redirect";
import { normalizeTournamentDateRange } from "@/lib/tournaments/date-range";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("single-day tournaments reuse dateFrom when dateTo is blank", () => {
  const formData = new FormData();
  formData.set("dateFrom", "2026-05-10");
  formData.set("dateTo", "");

  assert.deepEqual(normalizeTournamentDateRange(formData), {
    dateFrom: "2026-05-10",
    dateTo: "2026-05-10"
  });
});

test("deck list edits fail when the submitted deck list id is missing", () => {
  const deckListService = source("lib/decks/deck-list-service.ts");

  assert.match(deckListService, /if \(deckListId && !existingDeckList\)/);
  assert.match(deckListService, /Deck list could not be found\./);
});

test("deck lists and matchup notes use relational rows with JSON compatibility", () => {
  const decksDb = source("lib/db/decks.ts");
  const deckListService = source("lib/decks/deck-list-service.ts");
  const matchupService = source("lib/decks/matchup-service.ts");

  assert.match(decksDb, /from\("deck_lists"\)/);
  assert.match(decksDb, /from\("deck_matchups"\)/);
  assert.match(decksDb, /relationalDeckLists\.get\(row\.id\)/);
  assert.match(decksDb, /relationalDeckMatchups\.get\(row\.id\)/);
  assert.match(decksDb, /parseDeckLists\(row\.deck_lists\)/);
  assert.match(decksDb, /parseDeckMatchups\(row\.matchups\)/);

  assert.match(deckListService, /upsertRelationalDeckLists/);
  assert.match(deckListService, /deck_lists: updatedDeckLists/);
  assert.match(matchupService, /upsertRelationalDeckMatchups/);
  assert.match(matchupService, /matchups: nextMatchups/);
});

test("user mutations select changed ids before reporting success", () => {
  const logsActions = source("app/(app)/logs/actions.ts");
  const decksActions = source("app/(app)/decks/actions.ts");
  const tournamentsActions = source("app/(app)/tournaments/actions.ts");

  assert.match(logsActions, /assertMutatedRows\(updatedLogs, 1, "Battle log not found\."\)/);
  assert.match(
    logsActions,
    /assertMutatedRows\(deletedLogs, logIds\.length, "Some selected battle logs could not be found\."\)/
  );
  assert.match(decksActions, /assertSingleMutationResult\(updatedDeck, "Deck could not be found\."\)/);
  assert.match(
    tournamentsActions,
    /throw userFacingActionError\("Tournament could not be found\."\)/
  );
});

test("route performance long tasks are scoped to the completed navigation", () => {
  const reporter = source("components/ui/RoutePerformanceReporter.tsx");

  assert.match(reporter, /type LongTaskEntry/);
  assert.match(reporter, /getLongTaskStatsSince/);
  assert.match(
    reporter,
    /getLongTaskStatsSince\(\s*longTaskEntriesRef\.current,\s*pendingNavigation\.startedAt,\s*finishedAt\s*\)/
  );
});

test("private helper endpoints disable caching and map user-facing share errors", () => {
  const importDialogRoute = source("app/api/import-dialog-data/route.ts");
  const sharesRoute = source("app/api/log-shares/route.ts");
  const logDetailBodyRoute = source("app/api/log-detail-body/route.ts");
  const logDetailContextRoute = source("app/api/log-detail-context/route.ts");
  const tournamentEditorRoute = source("app/api/tournament-editor-data/route.ts");
  const testLoginRoute = source("app/auth/test-login/route.ts");
  const apiResponse = source("lib/server/api-response.ts");

  assert.match(apiResponse, /PRIVATE_NO_STORE_HEADERS/);
  assert.match(importDialogRoute, /privateJson/);
  assert.match(sharesRoute, /getActionErrorStatus/);
  assert.match(sharesRoute, /message\.includes\("not found"\)/);
  assert.match(logDetailBodyRoute, /privateJson/);
  assert.match(logDetailContextRoute, /privateJson/);
  assert.match(tournamentEditorRoute, /privateJson/);
  assert.match(testLoginRoute, /POKE_NOTES_ENABLE_TEST_LOGIN/);
});

test("admin fallback reads use paginated Supabase fetches", () => {
  const adminDb = source("lib/db/admin.ts");

  assert.match(adminDb, /fetchAllRows<ProfileRow>/);
  assert.match(adminDb, /fetchAllRows<DeckCountRow>/);
  assert.match(adminDb, /select\("id", \{ count: "exact", head: true \}\)/);
});

test("local auth helper reuses the existing Codex test user", () => {
  const packageJson = source("package.json");
  const setupScript = source("scripts/setup-local-test-login.mjs");

  assert.match(packageJson, /"auth:local:setup": "node scripts\/setup-local-test-login\.mjs"/);
  assert.match(packageJson, /"auth:local:save": "node scripts\/save-local-auth-state\.mjs"/);
  assert.match(packageJson, /"dev:test-login": "node scripts\/setup-local-test-login\.mjs && next dev"/);
  assert.match(setupScript, /findConfiguredOrExistingCodexUser/);
  assert.doesNotMatch(setupScript, /createUser/);
  assert.doesNotMatch(setupScript, /role:\s*"admin"/);
});

test("server actions clamp editable redirect targets to app paths", () => {
  assert.equal(getSafeRedirectPath("/logs/abc?tab=summary", "/logs"), "/logs/abc?tab=summary");
  assert.equal(getSafeRedirectPath("", "/logs"), "/logs");
  assert.equal(getSafeRedirectPath("https://example.com", "/logs"), "/logs");
  assert.equal(getSafeRedirectPath("//example.com/path", "/logs"), "/logs");
  assert.equal(withRefreshToken("/logs?deck=abc", 123), "/logs?deck=abc&r=123");

  const decksActions = source("app/(app)/decks/actions.ts");
  const logsActions = source("app/(app)/logs/actions.ts");
  const tournamentsActions = source("app/(app)/tournaments/actions.ts");

  assert.doesNotMatch(decksActions, /function getRedirectTarget/);
  assert.doesNotMatch(logsActions, /function getRedirectTarget/);
  assert.doesNotMatch(tournamentsActions, /function getRedirectTarget/);
  assert.match(decksActions, /getFormRedirectPath\(formData, `\/decks\/\$\{deckId\}`\)/);
  assert.match(logsActions, /getFormRedirectPath\(formData, `\/logs\/\$\{logId\}`\)/);
  assert.match(
    tournamentsActions,
    /getFormRedirectPath\(formData, `\/tournaments\/\$\{tournamentId\}`\)/
  );
});

test("edit-log bulk dock keeps compact selects accessible", () => {
  const appSelect = source("components/shadcn/app-select.tsx");
  const logsManager = source("components/ui/LogsManager.tsx");

  assert.match(appSelect, /"aria-label"\?: string/);
  assert.match(appSelect, /aria-label=\{ariaLabel\}/);
  assert.match(logsManager, /aria-label="Deck strategy for selected logs"/);
  assert.match(logsManager, /aria-label="Deck list for selected logs"/);
});
