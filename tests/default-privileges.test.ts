import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20260711203447_harden_public_schema_default_privileges.sql",
  import.meta.url
);
const schemaPath = new URL("../schema.sql", import.meta.url);

const migration = readFileSync(migrationPath, "utf8").trim();
const schema = readFileSync(schemaPath, "utf8");

function canonicalDefaultPrivilegeBlock() {
  const startMarker =
    "-- Make every future public-schema interface an explicit API decision.";
  const endMarker = "-- End future-object default privilege boundary.";
  const start = schema.indexOf(startMarker);
  const end = schema.indexOf(endMarker, start);

  assert.notEqual(start, -1, "schema.sql is missing the default-privilege boundary");
  assert.notEqual(end, -1, "schema.sql is missing the default-privilege end marker");

  return schema.slice(start, end + endMarker.length).trim();
}

test("canonical schema and migration keep the same default-privilege boundary", () => {
  assert.equal(canonicalDefaultPrivilegeBlock(), migration);
});
