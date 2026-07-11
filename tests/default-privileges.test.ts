import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20260711203447_harden_public_schema_default_privileges.sql",
  import.meta.url
);
const schemaPath = new URL("../schema.sql", import.meta.url);
const schemaHealthPath = new URL("../scripts/schema-health.mjs", import.meta.url);

const migration = readFileSync(migrationPath, "utf8").trim();
const schema = readFileSync(schemaPath, "utf8");
const schemaHealth = readFileSync(schemaHealthPath, "utf8");

function executableSql(source: string) {
  return source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

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

test("migration changes future defaults without rewriting current object ACLs or rows", () => {
  const sql = executableSql(migration);

  assert.doesNotMatch(sql, /\b(?:insert|update|delete|truncate)\s+/i);
  assert.doesNotMatch(sql, /\b(?:create|alter|drop)\s+(?:table|function|sequence)\s+public\./i);
  assert.doesNotMatch(sql, /\b(?:grant|revoke)\b[\s\S]*?\bon\s+(?:table|function|sequence)\s+public\./i);
  assert.match(sql, /alter default privileges for role postgres/g);
  assert.match(
    sql,
    /pg_has_role\(current_user, 'postgres', 'MEMBER'\)/
  );
});

test("future public tables and sequences require explicit grants", () => {
  assert.match(
    migration,
    /in schema public\s+revoke all privileges on tables\s+from anon, authenticated, service_role;/
  );
  assert.match(
    migration,
    /in schema public\s+revoke all privileges on sequences\s+from anon, authenticated, service_role;/
  );
});

test("future public routines are hardened without changing non-public defaults", () => {
  assert.match(
    migration,
    /in schema public\s+revoke execute on functions\s+from anon, authenticated, service_role;/
  );
  assert.match(
    migration,
    /create event trigger pokenotes_harden_public_routine_privileges[\s\S]*?on ddl_command_end/
  );
  assert.match(
    migration,
    /command\.schema_name = 'public'[\s\S]*?not command\.in_extension/
  );
  assert.match(migration, /routine\.proowner = 'postgres'::regrole/);
  assert.match(migration, /revoke execute on routine %s from public, anon, authenticated, service_role/);
  assert.match(migration, /security definer\s+set search_path = ''/);

  const sql = executableSql(migration);
  assert.doesNotMatch(
    sql,
    /alter default privileges for role postgres\s+revoke execute on functions\s+from public;/
  );
  assert.doesNotMatch(sql, /in schema (?!public\b)[a-z_]+\s+(?:grant|revoke)/i);
});

test("rollback notes restore only future defaults and flag intervening objects for review", () => {
  assert.match(migration, /Rollback \(future objects only\)/);
  assert.match(
    migration,
    /Objects created, or routines replaced, while\s+-- the hardened boundary was active keep their explicit ACLs/
  );
  assert.match(
    migration,
    /grant all privileges on tables to anon, authenticated, service_role;/
  );
  assert.match(
    migration,
    /drop event trigger if exists pokenotes_harden_public_routine_privileges;/
  );
  assert.match(
    migration,
    /drop function if exists private\.harden_new_public_routine_privileges\(\);/
  );
});

test("linked schema health verifies the owner-scoped default ACL contract", () => {
  for (const contract of [
    "future_public_tables_require_explicit_grants",
    "future_public_sequences_require_explicit_grants",
    "future_public_functions_require_explicit_grants",
    "future_public_routine_hardener_is_active",
    "future_public_routine_hardener_is_scoped_and_locked_down",
    "public_objects_use_the_hardened_creator_role"
  ]) {
    assert.match(schemaHealth, new RegExp(contract));
  }

  assert.match(schemaHealth, /pg_catalog\.pg_default_acl/);
  assert.match(schemaHealth, /pg_catalog\.aclexplode/);
  assert.match(schemaHealth, /pg_catalog\.pg_event_trigger/);
  assert.match(schemaHealth, /command\.schema_name = ''public''/);
  assert.match(schemaHealth, /not command\.in_extension/);
  assert.match(schemaHealth, /routine\.proowner = ''postgres''::regrole/);
  assert.match(schemaHealth, /relation\.relowner/);
  assert.match(schemaHealth, /procedure\.proowner/);
});
