import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260821003055_first_class_deck_lists.sql"),
  "utf8"
);
const schema = readFileSync(join(process.cwd(), "schema.sql"), "utf8");

function sqlFunction(source: string, name: string, endMarker: string) {
  const start = source.indexOf(`create or replace function public.${name}`);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0, `${name} must exist`);
  assert.ok(end > start, `${name} must have a bounded body`);
  return source.slice(start, end);
}

test("first-class Deck List migration keeps ownership while making strategy association optional", () => {
  assert.match(migration, /alter table public\.deck_lists\s+alter column deck_id drop not null/i);
  assert.match(
    migration,
    /foreign key \(user_id, deck_id\)\s+references public\.decks \(user_id, id\)\s+on delete set null \(deck_id\)/i
  );
  assert.match(migration, /add column if not exists creation_key text/i);
  assert.match(migration, /create unique index[^;]+on public\.deck_lists \(user_id, creation_key\)/i);
  assert.match(migration, /drop constraint if exists deck_lists_pkey/i);
  assert.match(migration, /add constraint deck_lists_pkey primary key \(user_id, id\)/i);
  assert.doesNotMatch(migration, /create unique index[^;]+on public\.deck_lists \(id\)/i);
});

test("fresh schema carries the same first-class Deck List shape and RPCs", () => {
  assert.match(schema, /alter column deck_id drop not null/i);
  assert.match(schema, /on delete set null \(deck_id\)/i);
  const freshDeckListState = schema.slice(schema.indexOf("-- Final first-class Deck List state"));
  assert.match(freshDeckListState, /drop constraint if exists deck_lists_pkey/i);
  assert.match(freshDeckListState, /add constraint deck_lists_pkey primary key \(user_id, id\)/i);
  assert.match(schema, /create or replace function public\.commit_first_class_deck_list\(/i);
  assert.match(schema, /create or replace function public\.set_deck_list_association\(/i);
  assert.match(schema, /can_use_deck_list_reference\(user_id, linked_deck_id, linked_deck_list_id\)/i);
  assert.doesNotMatch(freshDeckListState, /add constraint logs_linked_deck_list_fkey/i);
  assert.doesNotMatch(freshDeckListState, /add constraint tournaments_linked_deck_list_fkey/i);
  assert.match(freshDeckListState, /set linked_deck_list_id = null/i);
});

test("first-class Deck List RPC is the server-side atomic and idempotent write boundary", () => {
  assert.match(migration, /create or replace function public\.commit_first_class_deck_list\(/i);
  assert.match(migration, /p_creation_key text/i);
  assert.match(migration, /p_expected_updated_at timestamptz/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /refresh-and-retry/i);
  assert.match(migration, /conflicting idempotency key/i);
  assert.match(migration, /grant execute on function public\.commit_first_class_deck_list/i);
  assert.match(migration, /create or replace function public\.set_deck_list_association\(/i);
  assert.match(migration, /refresh-and-retry before changing its association/i);
  assert.match(migration, /grant execute on function public\.set_deck_list_association/i);
});

test("reference policies validate standalone and associated list links by account", () => {
  assert.match(migration, /p_deck_list_id is null/i);
  assert.match(migration, /deck_list\.user_id = p_user_id/i);
  assert.match(migration, /can_use_deck_list_reference\(user_id, linked_deck_id, linked_deck_list_id\)/i);
  assert.doesNotMatch(migration, /add constraint logs_linked_deck_list_fkey/i);
  assert.doesNotMatch(migration, /add constraint tournaments_linked_deck_list_fkey/i);
  assert.doesNotMatch(migration, /foreign key \(user_id, linked_deck_list_id\)/i);
  assert.match(migration, /remove_deleted_deck_list_legacy_copy/i);
});

test("creation identity is concurrency-safe and independent of payload-generated IDs", () => {
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /v_creation_key/i);
  assert.match(migration, /creation_key[\s\S]*conflicting idempotency key|conflicting idempotency key[\s\S]*creation_key/i);
  assert.doesNotMatch(migration, /v_requested_fingerprint[\s\S]{0,500}'id', v_list_id/);
});

test("compatibility and association paths document a single lock order", () => {
  assert.match(migration, /lock order: deck list then strategy/i);
  assert.match(migration, /set_deck_list_association[\s\S]*?pg_advisory_xact_lock[\s\S]*?for update/i);
  assert.match(migration, /commit_first_class_deck_list[\s\S]*?pg_advisory_xact_lock/i);
  assert.match(migration, /commit_deck_aggregate_child_legacy_parent_first/i);
  assert.match(migration, /commit_deck_aggregate_child[\s\S]*?pg_advisory_xact_lock[\s\S]*?deck_lists[\s\S]*?for update/i);
  assert.match(migration, /remove_deleted_deck_list_legacy_copy[\s\S]*?linked_deck_list_id = null[\s\S]*?old\.deck_id/i);
});

test("legacy adoption is owner-scoped, exact, and fail-closed when identity is ambiguous", () => {
  const commit = sqlFunction(
    migration,
    "commit_first_class_deck_list(",
    "revoke all on function public.commit_first_class_deck_list"
  );

  assert.match(commit, /_legacySourceDeckId/);
  assert.match(commit, /from public\.decks[\s\S]*where user_id = v_user_id/i);
  assert.match(commit, /v_legacy_match_count\s*<>\s*1/i);
  assert.match(commit, /v_legacy_match_count\s*>\s*1/i);
  assert.match(commit, /v_target_id\s*:=\s*gen_random_uuid\(\)::text/i);
  assert.match(commit, /update public\.logs[\s\S]*linked_deck_list_id = v_list_id/i);
  assert.match(commit, /update public\.tournaments[\s\S]*linked_deck_list_id = v_list_id/i);
});

test("deletion preserves verified independent references and clears unresolved collisions", () => {
  for (const source of [migration, schema]) {
    const strategyDelete = sqlFunction(
      source,
      "preserve_deleted_deck_legacy_references(",
      "revoke all on function public.preserve_deleted_deck_legacy_references"
    );
    const listDelete = sqlFunction(
      source,
      "remove_deleted_deck_list_legacy_copy()",
      "revoke all on function public.remove_deleted_deck_list_legacy_copy"
    );

    assert.match(strategyDelete, /v_legacy_count > 1/);
    assert.match(strategyDelete, /insert into public\.deck_lists/);
    assert.match(strategyDelete, /update public\.logs/);
    assert.match(strategyDelete, /update public\.tournaments/);
    assert.doesNotMatch(
      strategyDelete,
      /deck_list\.deck_id\s*=\s*p_deck_id\s+or\s+deck_list\.deck_id\s+is\s+null/i
    );
    assert.match(listDelete, /linked_deck_list_id = old\.id/);
    assert.match(listDelete, /linked_deck_id = old\.deck_id/);
  }
});

test("initial log reads resolve exact legacy identity without arbitrary duplicate selection", () => {
  for (const source of [migration, schema.slice(schema.indexOf("-- Final first-class Deck List state"))]) {
    const readModel = sqlFunction(
      source,
      "get_initial_logs_page_data(",
      "revoke execute on function public.get_initial_logs_page_data"
    );

    assert.match(readModel, /legacy_deck\.user_id\s*=\s*ordered_logs\.user_id/i);
    assert.match(readModel, /legacy_deck\.id\s*=\s*ordered_logs\.linked_deck_id/i);
    assert.match(readModel, /having\s+count\(\*\)\s*=\s*1/i);
    assert.match(readModel, /\)\s*<>\s*1/i);
    assert.doesNotMatch(
      readModel,
      /select\s+deck_list\s*->>\s*'name'[\s\S]*?limit\s+1/i
    );
  }
});

test("direct writes stay revoked and schema health tracks every privileged boundary", () => {
  const schemaHealth = readFileSync(join(process.cwd(), "scripts/schema-health.mjs"), "utf8");

  assert.match(migration, /revoke all privileges on table public\.deck_lists from public, anon, authenticated/i);
  assert.match(migration, /grant select on table public\.deck_lists to authenticated/i);
  for (const name of [
    "commit_first_class_deck_list",
    "set_deck_list_association",
    "delete_first_class_deck_list",
    "delete_owned_deck"
  ]) {
    assert.match(schemaHealth, new RegExp(`\\"${name}\\"`));
  }
  assert.match(schemaHealth, /first_class_deck_list_rpcs_are_callable/);
});

test("the release plan expands the schema before app RPC use and keeps fallback local", () => {
  const plan = readFileSync(
    join(process.cwd(), "docs/deck-list-first-class-deploy-order.md"),
    "utf8"
  );
  assert.match(plan, /20260821003055_first_class_deck_lists\.sql/);
  assert.match(plan, /migration first/i);
  assert.match(plan, /RPC fallback/i);
  assert.match(plan, /do not deploy production/i);
});
