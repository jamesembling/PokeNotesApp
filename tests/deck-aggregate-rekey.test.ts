import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260711224609_rekey_deck_aggregate_collisions.sql",
    import.meta.url
  ),
  "utf8"
);

test("the collision repair is data-derived and fail-closed around the reviewed scope", () => {
  assert.match(migration, /v_list_count <> 19/);
  assert.match(migration, /v_matchup_count <> 1/);
  assert.match(migration, /v_parent_count <> 11/);
  assert.match(migration, /v_target_log_count <> 31/);
  assert.match(migration, /v_untouched_log_count <> 43/);
  assert.match(migration, /v_target_tournament_count <> 0/);
  assert.doesNotMatch(
    migration,
    /['"][0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}['"]/i
  );
});

test("Battle Log links are repaired only through owner, parent, and child identity", () => {
  assert.match(
    migration,
    /\(log\.user_id, log\.linked_deck_id, log\.linked_deck_list_id\)\s*=\s*\(mapping\.user_id, mapping\.deck_id, mapping\.old_id\)/
  );
  assert.match(migration, /deck_aggregate_untouched_log_snapshot/);
  assert.match(migration, /A non-target Battle Log using a reused ID changed/);
  assert.doesNotMatch(
    migration,
    /update public\.logs[\s\S]{0,300}where log\.linked_deck_list_id = mapping\.old_id/
  );
});

test("the repair preserves timestamps and retains a private 30-day mapping ledger", () => {
  assert.match(migration, /private\.deck_aggregate_rekey_ledger/);
  assert.match(migration, /enable row level security/);
  assert.match(
    migration,
    /revoke all privileges[\s\S]*?from public, anon, authenticated, service_role/
  );
  assert.match(migration, /statement_timestamp\(\) \+ interval '30 days'/);
  assert.match(migration, /disable trigger set_decks_updated_at/);
  assert.match(migration, /disable trigger set_logs_updated_at/);
  assert.match(migration, /enable trigger set_logs_updated_at/);
  assert.match(migration, /enable trigger set_decks_updated_at/);
  assert.match(migration, /changed outside its aggregate child IDs/);
  assert.match(migration, /changed outside its scoped list ID/);
});

test("re-keyed rows are rebuilt from the preserved JSON rather than another account row", () => {
  assert.match(migration, /insert into public\.deck_lists[\s\S]*?mapping\.child/);
  assert.match(migration, /insert into public\.deck_matchups[\s\S]*?mapping\.child/);
  assert.match(migration, /jsonb_set\(child\.value, '\{id\}', to_jsonb\(mapping\.new_id\), false\)/);
  assert.doesNotMatch(migration, /on conflict[\s\S]*?do update/i);
});
