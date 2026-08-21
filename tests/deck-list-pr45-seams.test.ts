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
