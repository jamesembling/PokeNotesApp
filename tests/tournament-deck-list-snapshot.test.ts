import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repositoryRoot = join(import.meta.dirname, "..");
const migration = readFileSync(
  join(repositoryRoot, "supabase/migrations/20260919224906_tournament_snapshot_workflow.sql"),
  "utf8"
);
const schema = readFileSync(join(repositoryRoot, "schema.sql"), "utf8");

test("Tournament Deck List workflow keeps the migration and fresh schema contract aligned", () => {
  for (const source of [migration, schema]) {
    assert.match(source, /create table public\.tournament_deck_list_snapshots/i);
    assert.match(source, /create table public\.tournament_deck_list_commands/i);
    assert.match(source, /unique \(user_id, tournament_id\)/i);
    assert.match(source, /unique \(user_id, request_id\)/i);
    assert.match(source, /alter table public\.tournament_deck_list_snapshots enable row level security/i);
    assert.match(source, /create or replace function public\.commit_tournament_deck_list/i);
    assert.match(source, /security definer[\s\S]*auth\.uid\(\)/i);
    assert.match(source, /p_expected_tournament_updated_at/i);
    assert.match(source, /payload_hash/i);
    assert.match(source, /remove_tournament_deck_list/i);
    assert.match(source, /create_tournament_round_idempotent/i);
    assert.match(source, /p_request_id text default null/i);
    assert.match(source, /payload - 'createdAt' - 'created_at' - 'updatedAt' - 'updated_at'/i);
    assert.doesNotMatch(source, /tournament_deck_list_commands[^;]*grant (?:select|insert|update|delete|all)[^;]*authenticated/i);
  }

  assert.match(migration, /grant all on public\.tournament_deck_list_snapshots to service_role/i);
  assert.doesNotMatch(
    migration,
    /grant (?:insert|update|delete|all)[^;]*tournament_deck_list_snapshots[^;]*authenticated/i
  );
});
