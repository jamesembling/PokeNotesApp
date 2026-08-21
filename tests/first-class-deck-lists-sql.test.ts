import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260821003055_first_class_deck_lists.sql"),
  "utf8"
);
const schema = readFileSync(join(process.cwd(), "schema.sql"), "utf8");

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
