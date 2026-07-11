import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const MIGRATION_PATH =
  "supabase/migrations/20260711195613_commit_deck_aggregate_children.sql";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const migration = source(MIGRATION_PATH);

function canonicalMigrationBlock() {
  const schema = source("schema.sql");
  const start = schema.indexOf(
    "-- Keep each Deck Aggregate write inside one database transaction."
  );
  assert.notEqual(start, -1, "schema.sql is missing the transactional Deck Aggregate block");

  const marker = "notify pgrst, 'reload schema';";
  const end = schema.indexOf(marker, start);
  assert.notEqual(end, -1, "schema.sql Deck Aggregate block is missing its schema reload");
  return schema.slice(start, end + marker.length).trim();
}

test("canonical schema and migration keep the same transactional Deck Aggregate function", () => {
  assert.equal(canonicalMigrationBlock(), migration.trim());
});

test("Deck Aggregate commit is an authenticated, RLS-preserving RPC", () => {
  assert.match(migration, /create or replace function public\.commit_deck_aggregate_child\(/);
  assert.match(migration, /security invoker\s+set search_path = pg_catalog/);
  assert.doesNotMatch(migration, /security definer/i);
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(
    migration,
    /where deck\.id = p_deck_id\s+and deck\.user_id = v_user_id\s+for update/
  );
  assert.match(
    migration,
    /revoke all on function public\.commit_deck_aggregate_child[\s\S]*from public, anon, authenticated/
  );
  assert.match(
    migration,
    /grant execute on function public\.commit_deck_aggregate_child[\s\S]*to authenticated/
  );
});

test("one RPC writes both compatibility stores without a destructive re-key", () => {
  assert.match(migration, /insert into public\.deck_lists/);
  assert.match(migration, /insert into public\.deck_matchups/);
  assert.match(migration, /set\s+deck_lists = v_next_children/);
  assert.match(migration, /set\s+matchups = v_next_children/);
  assert.match(migration, /on conflict \(user_id, deck_id, id\)/g);
  assert.doesNotMatch(migration, /\bdelete\s+from\b/i);
  assert.doesNotMatch(migration, /update\s+public\.(logs|tournaments)\b/i);
  assert.doesNotMatch(migration, /\bcommit\s*;/i);
});

test("untouched historical lists keep a missing sort version as null", () => {
  assert.match(
    migration,
    /when jsonb_typeof\(child\.value -> 'sorted_cards_version'\) = 'number'[\s\S]*?else null[\s\S]*?end,/
  );
  assert.doesNotMatch(
    migration,
    /when jsonb_typeof\(child\.value -> 'sorted_cards_version'\) = 'number'[\s\S]*?else 2[\s\S]*?end,/
  );
});

test("the locked mutation merges concurrent edits and detects same-child conflicts", () => {
  assert.match(
    migration,
    /jsonb_build_array\(p_child\) \|\| v_current_children/
  );
  assert.match(
    migration,
    /v_current_children \|\| jsonb_build_array\(p_child\)/
  );
  assert.match(migration, /when child\.value ->> 'id' = v_child_id then p_child/);
  assert.match(
    migration,
    /v_current_child_updated_at <> p_expected_child_updated_at/
  );
  assert.match(migration, /p_updated_at <= v_current_child_updated_at_timestamp/);
  assert.match(migration, /from public\.deck_lists as relational_child/);
  assert.match(migration, /from public\.deck_matchups as relational_child/);
  assert.match(migration, /group by child\.value ->> 'id'\s+having count\(\*\) > 1/);
});

test("direct RPC input is validated before the parent lock", () => {
  const lockPosition = migration.indexOf("for update;");
  assert.ok(lockPosition > 0);

  for (const evidence of [
    "Authentication is required.",
    "Deck id is required.",
    "Unsupported deck aggregate child kind.",
    "Unsupported deck aggregate operation.",
    "Deck aggregate child id is required.",
    "Deck aggregate child and commit timestamps must match.",
    "Deck list card data is invalid.",
    "Matchup Pokemon are invalid.",
    "Matchup go preference is invalid."
  ]) {
    const position = migration.indexOf(evidence);
    assert.ok(position >= 0, `missing validation: ${evidence}`);
    assert.ok(position < lockPosition, `validation happens after the parent lock: ${evidence}`);
  }
});

test("the server adapter uses only the typed transactional RPC for persistence", () => {
  const writer = source("lib/decks/deck-aggregate-writer.ts");
  const types = source("types/supabase.ts");

  assert.match(writer, /supabase\.rpc\("commit_deck_aggregate_child", \{/);
  for (const argument of [
    "p_child",
    "p_deck_id",
    "p_expected_child_updated_at",
    "p_kind",
    "p_operation",
    "p_updated_at"
  ]) {
    assert.match(writer, new RegExp(`${argument}:`));
    assert.match(types, new RegExp(`${argument}:`));
  }
  assert.doesNotMatch(writer, /\.from\("deck_lists"\)\s*\.upsert/);
  assert.doesNotMatch(writer, /\.from\("deck_matchups"\)\s*\.upsert/);
  assert.match(types, /commit_deck_aggregate_child: \{/);
});

test("schema health verifies the new RPC privilege and search-path contract", () => {
  const health = source("scripts/schema-health.mjs");

  assert.match(health, /"commit_deck_aggregate_child"/);
  assert.match(health, /authenticated_can_commit_deck_aggregates/);
  assert.match(health, /anon_cannot_commit_deck_aggregates/);
  assert.match(health, /deck_aggregate_commit_is_invoker_with_fixed_search_path/);
  assert.match(health, /procedure\.proconfig = array\['search_path=pg_catalog'\]/);
});
