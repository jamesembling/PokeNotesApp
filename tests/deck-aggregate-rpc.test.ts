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

test("canonical schema and migration carry the same Deck Aggregate SQL block", () => {
  assert.equal(canonicalMigrationBlock(), migration.trim());
});
