import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260821003055_first_class_deck_lists.sql"),
  "utf8"
);
const schema = readFileSync(join(process.cwd(), "schema.sql"), "utf8");

function readModel(source: string) {
  const start = source.indexOf("create or replace function public.get_initial_logs_page_data(");
  const end = source.indexOf("revoke execute on function public.get_initial_logs_page_data", start);
  assert.ok(start >= 0, "the initial logs read model must exist");
  assert.ok(end > start, "the initial logs read model must have a bounded body");
  return source.slice(start, end);
}

test("initial and fresh-schema read models count exact legacy identity before naming a list", () => {
  const sources = [
    readModel(migration),
    readModel(schema.slice(schema.indexOf("-- Final first-class Deck List state")))
  ];

  for (const source of sources) {
    assert.match(source, /count\(\*\)/i);
    assert.match(source, /having\s+count\(\*\)\s*=\s*1/i);
    assert.match(source, /\)\s*<>\s*1/i);
    assert.match(source, /legacy_deck\.user_id\s*=\s*ordered_logs\.user_id/i);
    assert.match(source, /legacy_deck\.id\s*=\s*ordered_logs\.linked_deck_id/i);
    assert.doesNotMatch(
      source,
      /select\s+deck_list\s*->>\s*'name'[\s\S]*?limit\s+1/i,
      "duplicate exact legacy copies must not be resolved by arbitrary row order"
    );
  }
});

test("read-model branches preserve unique legacy precedence, relational fallback, and fail-closed ambiguity", () => {
  const source = readModel(migration);

  assert.match(source, /having\s+count\(\*\)\s*=\s*1/i);
  assert.match(
    source,
    /relational_list\.user_id\s*=\s*ordered_logs\.user_id[\s\S]*select\s+count\(\*\)[\s\S]*\)\s*<>\s*1/i
  );
  assert.match(
    source,
    /legacy_item\.value\s*->>\s*'id'\s*=\s*ordered_logs\.linked_deck_list_id[\s\S]*having\s+count\(\*\)\s*=\s*1/i
  );
});
