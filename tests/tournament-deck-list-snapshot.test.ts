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
const hardening = readFileSync(
  join(repositoryRoot, "supabase/migrations/20260920120000_tournament_workflow_hardening.sql"),
  "utf8"
);
const strategyIdentityMigration = readFileSync(
  join(repositoryRoot, "supabase/migrations/20260920130207_tournament_strategy_command_identity.sql"),
  "utf8"
);
const tournamentActions = readFileSync(
  join(repositoryRoot, "app/(app)/tournaments/actions.ts"),
  "utf8"
);

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

  assert.match(tournamentActions, /supabase\.rpc\(\s*"create_tournament_round_idempotent"/i);
  assert.doesNotMatch(tournamentActions, /supabase\.rpc\(\s*"create_tournament_round"/i);
  assert.doesNotMatch(tournamentActions, /from\("tournament_rounds"\)\s*\.insert\(/i);
});

test("Tournament metadata and Strategy-from-list commands are present in the forward contract", () => {
  for (const source of [hardening, schema]) {
    assert.match(source, /create table(?: if not exists)? public\.tournament_metadata_commands/i);
    assert.match(source, /create or replace function public\.commit_tournament_metadata/i);
    assert.match(source, /create or replace function public\.create_deck_strategy_from_list/i);
    assert.match(source, /p_expected_tournament_updated_at/i);
    assert.match(source, /associateStrategy/i);
    assert.match(source, /drop constraint if exists tournament_deck_list_commands_tournament_id_fkey/i);
  }
  assert.match(hardening, /p_operation = 'create' and p_tournament_id <> v_request_id/i);
  assert.match(hardening, /status', 'idempotent'/i);
  assert.match(hardening, /not owned by this account/i);
  assert.match(hardening, /'allowReplace', p_allow_replace/i);
  assert.match(hardening, /Tournament format is not an allowed site format/i);
  assert.match(hardening, /Tournament placement is invalid/i);
  for (const source of [strategyIdentityMigration, schema]) {
    assert.match(source, /create table(?: if not exists)? public\.deck_strategy_commands/i);
    assert.match(source, /That Strategy creation identity was already used with different values/i);
    assert.match(source, /deck_strategy_commands[\s\S]*request_unique/i);
  }
});
