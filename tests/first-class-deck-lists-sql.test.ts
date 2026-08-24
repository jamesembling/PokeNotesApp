import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260821003055_first_class_deck_lists.sql"),
  "utf8"
);
const schema = readFileSync(join(process.cwd(), "schema.sql"), "utf8");

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
