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
  const aggregateWriter = source("lib/decks/deck-aggregate-writer.ts");

  assert.match(aggregateWriter, /if \(deckListId && !existingDeckList\)/);
  assert.match(aggregateWriter, /Deck list could not be found\./);
});

test("deck lists and matchup notes use relational rows with JSON compatibility", () => {
  const decksDb = source("lib/db/decks.ts");
  const deckListService = source("lib/decks/deck-list-service.ts");
  const matchupService = source("lib/decks/matchup-service.ts");
  const aggregateWriter = source("lib/decks/deck-aggregate-writer.ts");

  assert.match(decksDb, /from\("deck_lists"\)/);
  assert.match(decksDb, /from\("deck_matchups"\)/);
  assert.match(decksDb, /relationalDeckLists\.get\(row\.id\)/);
  assert.match(decksDb, /relationalDeckMatchups\.get\(row\.id\)/);
  assert.match(decksDb, /parseDeckLists\(row\.deck_lists\)/);
  assert.match(decksDb, /parseDeckMatchups\(row\.matchups\)/);

  assert.match(deckListService, /createServerDeckAggregateWriter/);
  assert.match(matchupService, /createServerDeckAggregateWriter/);
  assert.match(aggregateWriter, /loadLegacyChildren/);
  assert.match(aggregateWriter, /adapter\.commit/);
  assert.match(aggregateWriter, /rpc\("commit_deck_aggregate_child"/);
  assert.match(aggregateWriter, /expectedChildUpdatedAt/);
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
    /getLongTaskStatsSince\(\s*longTaskEntriesRef\.current,\s*pendingNavigation\.startedAt,\s*candidateCompletedAt\s*\)/
  );
});

test("route performance hard loads snapshot resources at the load boundary", () => {
  const reporter = source("components/ui/RoutePerformanceReporter.tsx");

  assert.match(reporter, /function reportHardLoad\(\)/);
  assert.match(reporter, /const reportHardLoadAfterLoad = \(\) => \{/);
  assert.match(reporter, /window\.requestAnimationFrame\(reportHardLoad\)/);
  assert.match(reporter, /hardLoadEndedAt = nav && nav\.loadEventEnd > 0 \? nav\.loadEventEnd : measuredAt/);
  assert.match(reporter, /getSlowestResourceSince\(0, hardLoadEndedAt\)/);
  assert.match(reporter, /window\.addEventListener\("load", reportHardLoadAfterLoad, \{ once: true \}\)/);
  assert.match(reporter, /responseEndMs/);
  assert.match(reporter, /documentDownloadMs/);
});

test("import log save navigates before the lazy dialog parent unmounts", () => {
  const dialog = source("components/ui/ImportLogDialog.tsx");
  const saveBlock = dialog.slice(
    dialog.indexOf("async function handleSubmit"),
    dialog.indexOf("useEffect(() => {", dialog.indexOf("async function handleSubmit"))
  );

  assert.match(saveBlock, /router\.push\(result\.redirectTo\);/);
  assert.match(
    saveBlock,
    /if \(normalizeRedirectPath\(result\.redirectTo\) === pathname\) \{\s*setIsOpen\(false\);\s*router\.refresh\(\);\s*onClose\?\.\(\);[\s\S]*?return;\s*\}\s*router\.push\(result\.redirectTo\);\s*navigationTimerRef\.current = window\.setTimeout\([\s\S]*?onClose\?\.\(\);/
  );
  assert.doesNotMatch(saveBlock, /setIsOpen\(false\);\s*onClose\?\.\(\);/);
  assert.doesNotMatch(saveBlock, /router\.push\(result\.redirectTo\);\s*onClose\?\.\(\);/);
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
  assert.match(sharesRoute, /error\.httpStatus \?\? 400/);
  assert.doesNotMatch(sharesRoute, /message\.includes/);
  assert.match(logDetailBodyRoute, /privateJson/);
  assert.match(logDetailContextRoute, /privateJson/);
  assert.match(tournamentEditorRoute, /privateJson/);
  assert.match(testLoginRoute, /deliberately unavailable/);
  assert.match(testLoginRoute, /status: 404/);
  assert.doesNotMatch(testLoginRoute, /POKE_NOTES_TEST_LOGIN_SECRET/);
});

test("admin fallback reads use paginated Supabase fetches", () => {
  const adminDb = source("lib/db/admin.ts");

  assert.match(adminDb, /fetchAllRows<ProfileRow>/);
  assert.match(adminDb, /fetchAllRows<DeckCountRow>/);
  assert.match(adminDb, /select\("id", \{ count: "exact", head: true \}\)/);
});

test("local auth helper reuses the existing Codex test user", () => {
  const packageJson = source("package.json");
  const perfScript = source("scripts/perf-prod.mjs");
  const devLoginRoute = source("app/auth/dev-login/route.ts");
  const saveAuthScript = source("scripts/save-local-auth-state.mjs");
  const setupScript = source("scripts/setup-local-test-login.mjs");
  const copyCodeScript = source("scripts/copy-local-login-code.mjs");

  assert.match(packageJson, /"auth:local:setup": "node scripts\/setup-local-test-login\.mjs"/);
  assert.match(packageJson, /"auth:local:copy-code": "node scripts\/copy-local-login-code\.mjs"/);
  assert.match(packageJson, /"auth:local:save": "node scripts\/save-local-auth-state\.mjs"/);
  assert.match(packageJson, /"dev:test-login": "node scripts\/setup-local-test-login\.mjs && next dev(?: [^"]*)?"/);
  assert.match(setupScript, /findConfiguredOrExistingCodexUser/);
  assert.doesNotMatch(setupScript, /createUser/);
  assert.doesNotMatch(setupScript, /role:\s*"admin"/);
  assert.match(setupScript, /writeFileSync\(localEnvPath, `\$\{nextContent\}\\n`, \{ mode: 0o600 \}\)/);
  assert.match(setupScript, /chmodSync\(localEnvPath, 0o600\)/);
  assert.match(setupScript, /POKE_NOTES_LOCAL_LOGIN_CODE/);
  assert.match(copyCodeScript, /execFileSync\("pbcopy"/);
  assert.doesNotMatch(copyCodeScript, /console\.log\(pairingCode\)/);
  assert.match(saveAuthScript, /chmodSync\(statePath, 0o600\)/);
  assert.match(saveAuthScript, /POKE_NOTES_LOCAL_LOGIN_CODE/);
  assert.match(saveAuthScript, /input\[name=\"pairingCode\"\]/);
  assert.doesNotMatch(saveAuthScript, /auth\/test-login/);
  assert.match(saveAuthScript, /expectedHostname/);
  assert.match(devLoginRoute, /validateLocalLoginAttempt/);
  assert.doesNotMatch(devLoginRoute, /requiresPairingCode\s*&&/);
  assert.match(perfScript, /chmodSync\(statePath, 0o600\)/);
  assert.doesNotMatch(perfScript, /PERF_TEST_LOGIN_SECRET/);
  assert.match(perfScript, /expectedHostname/);
});

test("server actions clamp editable redirect targets to app paths", () => {
  assert.equal(getSafeRedirectPath("/logs/abc?tab=summary", "/logs"), "/logs/abc?tab=summary");
  assert.equal(getSafeRedirectPath("", "/logs"), "/logs");
  assert.equal(getSafeRedirectPath("https://example.com", "/logs"), "/logs");
  assert.equal(getSafeRedirectPath("//example.com/path", "/logs"), "/logs");
  assert.equal(getSafeRedirectPath("/\\example.com/path", "/logs"), "/logs");
  assert.equal(getSafeRedirectPath("/logs\u0000/hidden", "/logs"), "/logs");
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

test("tournament round deletion is scoped to its parent tournament", () => {
  const tournamentsActions = source("app/(app)/tournaments/actions.ts");
  const deleteRoundStart = tournamentsActions.indexOf(
    "export async function deleteTournamentRoundAction"
  );
  const deleteRoundBlock = tournamentsActions.slice(
    deleteRoundStart,
    tournamentsActions.indexOf("revalidateTournamentWorkspace(tournamentId)", deleteRoundStart)
  );

  assert.match(deleteRoundBlock, /\.eq\("id", roundId\)/);
  assert.match(deleteRoundBlock, /\.eq\("tournament_id", tournamentId\)/);
  assert.match(deleteRoundBlock, /\.eq\("user_id", user\.id\)/);
});

test("tournament round saves verify ownership of the parent tournament", () => {
  const tournamentsActions = source("app/(app)/tournaments/actions.ts");
  const saveRoundStart = tournamentsActions.indexOf(
    "export async function saveTournamentRoundAction"
  );
  const deleteRoundStart = tournamentsActions.indexOf(
    "export async function deleteTournamentRoundAction",
    saveRoundStart
  );
  const saveRoundBlock = tournamentsActions.slice(saveRoundStart, deleteRoundStart);

  assert.ok(saveRoundStart >= 0 && deleteRoundStart > saveRoundStart);
  assert.match(saveRoundBlock, /\.from\("tournaments"\)/);
  assert.match(saveRoundBlock, /\.eq\("id", tournamentId\)/);
  assert.match(saveRoundBlock, /\.eq\("user_id", user\.id\)/);
  assert.match(saveRoundBlock, /if \(!ownedTournament\)/);
});

test("edit-log bulk dock keeps compact selects accessible", () => {
  const appSelect = source("components/shadcn/app-select.tsx");
  const logsManager = source("components/ui/LogsManager.tsx");

  assert.match(appSelect, /"aria-label"\?: string/);
  assert.match(appSelect, /aria-label=\{ariaLabel\}/);
  assert.match(logsManager, /aria-label="Deck strategy for selected logs"/);
  assert.match(logsManager, /aria-label="Deck list for selected logs"/);
});

test("the authenticated app shell provides a keyboard skip link", () => {
  const appShell = source("components/ui/AppShell.tsx");

  assert.match(appShell, /href="#main-content"/);
  assert.match(appShell, />\s*Skip to main content\s*<\/a>/);
  assert.match(appShell, /-translate-y-20/);
  assert.match(appShell, /focus:translate-y-0/);
  assert.doesNotMatch(appShell, /focus:not-sr-only/);
  assert.match(appShell, /<SidebarInset id="main-content" tabIndex=\{-1\}>/);
});

test("battle-log turn labels use the semantic foreground token", () => {
  const battleLogDetail = source("components/ui/BattleLogDetailView.tsx");

  assert.match(battleLogDetail, /font-semibold text-card-foreground/);
  assert.doesNotMatch(battleLogDetail, /text-black dark:text-white/);
});

test("shared secondary and status text tokens meet the reviewed contrast contract", () => {
  const globalStyles = source("app/globals.css");
  const badge = source("components/shadcn/badge.tsx");
  const alert = source("components/shadcn/alert.tsx");

  assert.match(globalStyles, /--muted-foreground: #5f6b7c/);
  assert.match(globalStyles, /--muted-foreground: #7f8897/);
  assert.match(globalStyles, /--color-win-strong: #126f33/);
  assert.equal(globalStyles.match(/--text-kicker: var\(--muted-foreground\)/g)?.length, 2);
  assert.match(badge, /bg-win-bg text-win-strong/);
  assert.match(badge, /bg-loss-bg text-loss-strong/);
  assert.match(badge, /bg-warning-bg text-warning-strong/);
  assert.match(alert, /bg-win-bg text-win-strong/);
  assert.match(alert, /bg-loss-bg text-loss-strong/);
  assert.match(alert, /bg-warning-bg text-warning-strong/);
});

test("the deck toolbar stacks before its controls overflow at 320px", () => {
  const deckStrategyCollection = source("components/ui/DeckStrategyCollection.tsx");

  assert.match(
    deckStrategyCollection,
    /className="grid min-w-0 grid-cols-\[minmax\(0,1fr\)\] gap-3"/
  );
  assert.match(deckStrategyCollection, /flex w-full min-w-0 flex-col/);
  assert.match(deckStrategyCollection, /min-\[360px\]:flex-row/);
  assert.match(deckStrategyCollection, /w-auto self-stretch/);
  assert.match(deckStrategyCollection, /min-\[360px\]:w-fit/);
});

test("motion preferences and calculator loading/status states are accessible", () => {
  const globalStyles = source("app/globals.css");
  const lazyCalculator = source("components/calculator/LazyProbabilityCalculator.tsx");
  const calculator = source("components/calculator/ProbabilityCalculator.tsx");

  assert.match(globalStyles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(lazyCalculator, /aria-label="Loading probability calculator"/);
  assert.match(lazyCalculator, /loading: CalculatorLoadingState/);
  assert.match(calculator, /<h1 className="sr-only">Probability Calculator<\/h1>/);
  assert.match(calculator, /className=\{statusClassName\} role="alert"/);
});
