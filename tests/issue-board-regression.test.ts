import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
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
  const actions = source("app/(app)/decks/actions.ts");

  assert.match(actions, /if \(deckListId && !existingDeckList\)/);
  assert.match(actions, /Deck list could not be found\./);
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
  const testLoginRoute = source("app/auth/test-login/route.ts");

  assert.match(importDialogRoute, /no-cache, no-store/);
  assert.match(sharesRoute, /getActionErrorStatus/);
  assert.match(sharesRoute, /message\.includes\("not found"\)/);
  assert.match(testLoginRoute, /POKE_NOTES_ENABLE_TEST_LOGIN/);
});

test("admin fallback reads use paginated Supabase fetches", () => {
  const adminDb = source("lib/db/admin.ts");

  assert.match(adminDb, /fetchAllRows<ProfileRow>/);
  assert.match(adminDb, /fetchAllRows<DeckCountRow>/);
  assert.match(adminDb, /select\("id", \{ count: "exact", head: true \}\)/);
});
