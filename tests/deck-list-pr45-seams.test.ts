import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260821003055_first_class_deck_lists.sql", import.meta.url),
  "utf8"
);
const schema = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");
const schemaHealth = readFileSync(new URL("../scripts/schema-health.mjs", import.meta.url), "utf8");
const tournamentActions = readFileSync(
  new URL("../app/(app)/tournaments/actions.ts", import.meta.url),
  "utf8"
);
const logActions = readFileSync(new URL("../app/(app)/logs/actions.ts", import.meta.url), "utf8");

function functionBody(source: string, name: string, endMarker: string) {
  const start = source.indexOf(`create or replace function public.${name}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `${name} is missing`);
  assert.notEqual(end, -1, `${name} end marker is missing`);
  return source.slice(start, end);
}

test("first-class list deletion clears independent relational references without deleting colliding legacy references", () => {
  for (const source of [migration, schema]) {
    const trigger = functionBody(
      source,
      "remove_deleted_deck_list_legacy_copy()",
      "revoke all on function public.remove_deleted_deck_list_legacy_copy"
    );

    assert.match(trigger, /linked_deck_list_id = old\.id/);
    assert.match(
      trigger,
      /not exists\s*\(\s*select 1\s+from public\.decks[\s\S]*?jsonb_array_elements[\s\S]*?legacy_deck\.id = (?:log|tournament)\.linked_deck_id[\s\S]*?item\.value ->> 'id' = old\.id/,
      "the trigger must distinguish a first-class reference from an unrelated legacy same-ID copy"
    );
    assert.match(
      trigger,
      /linked_deck_id = old\.deck_id/,
      "the deleted list's associated strategy remains a valid exact reference"
    );
  }
});

test("Strategy deletion preserves independent relational links and fails closed for unresolved legacy collisions", () => {
  for (const source of [migration, schema]) {
    const helper = functionBody(
      source,
      "preserve_deleted_deck_legacy_references(",
      "revoke all on function public.preserve_deleted_deck_legacy_references"
    );
    const loopEnd = helper.indexOf("end loop;");
    const finalCleanup = helper.slice(helper.indexOf("update public.logs as log", loopEnd));

    // Exact legacy children are adopted/rekeyed, while duplicate legacy ids
    // are cleared for both logs and tournaments instead of guessed.
    assert.match(
      helper,
      /if v_legacy_count > 1[\s\S]*?update public\.logs[\s\S]*?linked_deck_id = null,\s*linked_deck_list_id = null/
    );
    assert.match(helper, /linked_deck_id = null,\s*linked_deck_list_id = v_target_id/);

    // A standalone or other-strategy relational list is independently owned;
    // preserve its id without inferring from the deleted strategy id.
    const logPredicate = finalCleanup.indexOf("log.linked_deck_list_id is not null");
    const preservedLog = finalCleanup.slice(
      finalCleanup.lastIndexOf("update public.logs as log", logPredicate),
      finalCleanup.indexOf("update public.tournaments as tournament", logPredicate)
    );
    assert.match(preservedLog, /set linked_deck_id = null/);
    assert.match(preservedLog, /deck_list\.id = log\.linked_deck_list_id/);
    assert.doesNotMatch(preservedLog, /deck_list\.deck_id\s*=\s*p_deck_id/);

    const tournamentPredicate = finalCleanup.indexOf(
      "tournament.linked_deck_list_id is not null"
    );
    const preservedTournament = finalCleanup.slice(
      finalCleanup.lastIndexOf("update public.tournaments as tournament", tournamentPredicate),
      finalCleanup.indexOf("update public.logs as log", tournamentPredicate)
    );
    assert.match(preservedTournament, /set linked_deck_id = null/);
    assert.match(preservedTournament, /deck_list\.id = tournament\.linked_deck_list_id/);
    assert.doesNotMatch(preservedTournament, /deck_list\.deck_id\s*=\s*p_deck_id/);

    // A reference with no verified relational/legacy source must lose both
    // ids; this is the fail-closed branch for ambiguous or stale collisions.
    assert.match(
      finalCleanup,
      /update public\.logs as log\s+set linked_deck_id = null,\s+linked_deck_list_id = null[\s\S]*?and not exists \([\s\S]*?deck_list\.user_id = p_user_id[\s\S]*?deck_list\.id = log\.linked_deck_list_id/
    );
    assert.match(
      finalCleanup,
      /update public\.tournaments as tournament\s+set linked_deck_id = null,\s+linked_deck_list_id = null[\s\S]*?and not exists \([\s\S]*?deck_list\.user_id = p_user_id[\s\S]*?deck_list\.id = tournament\.linked_deck_list_id/
    );
  }
});

test("schema health requires the list-delete cleanup function and trigger", () => {
  assert.match(
    schemaHealth,
    /const REQUIRED_FUNCTIONS = \[[\s\S]*?"remove_deleted_deck_list_legacy_copy"[\s\S]*?\];/
  );
  assert.match(
    schemaHealth,
    /const REQUIRED_TRIGGERS = \[[\s\S]*?"remove_deleted_deck_list_legacy_copy"[\s\S]*?\];/
  );
});

test("ordinary Tournament saves validate account-owned lists independently of the selected strategy", () => {
  assert.match(tournamentActions, /validateDeckListReference/);
  assert.equal(
    (tournamentActions.match(/validateDeckListReference\(\{/g) ?? []).length,
    2,
    "create and update must both validate the selected list"
  );
  assert.match(tournamentActions, /linked_deck_list_id:\s*validatedReference\.deckListId/);
  assert.doesNotMatch(
    tournamentActions,
    /resolvedDeckListId\s*=\s*resolvedDeck\?\.deckListIds\.includes/,
    "a first-class list must not be accepted only when copied into the selected strategy JSON"
  );
});

test("log sharing resolves independent first-class lists while retaining exact legacy fallback and card metadata", () => {
  assert.match(
    logActions,
    /const deckListById =\s*log\.linkedDeckListId\s*\?\s*await getDeckListById\(\s*user\.id,\s*log\.linkedDeckListId,\s*log\.linkedDeckId \?\? null\s*\)/
  );
  assert.match(logActions, /linkedDeckListSortedCards:\s*resolvedDeckList\?\.sortedCards \?\? \[\]/);
  assert.match(logActions, /linkedDeckListRawList:\s*resolvedDeckList\?\.rawList/);
});
