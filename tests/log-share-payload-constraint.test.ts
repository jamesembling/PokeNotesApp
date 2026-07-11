import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20260711204150_enforce_log_share_payload_envelope.sql",
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

function canonicalPayloadEnvelopeBlock() {
  const startMarker =
    "-- Reject malformed direct-RPC snapshots before they consume storage";
  const endMarker = "-- End log-share v1 payload envelope boundary.";
  const start = schema.indexOf(startMarker);
  const end = schema.indexOf(endMarker, start);

  assert.notEqual(start, -1, "schema.sql is missing the share-envelope boundary");
  assert.notEqual(end, -1, "schema.sql is missing the share-envelope end marker");

  return schema.slice(start, end).trim();
}

test("canonical schema and migration keep the same share payload envelope", () => {
  assert.equal(canonicalPayloadEnvelopeBlock(), migration);
});

test("constraint rejects absent required fields instead of accepting SQL null", () => {
  for (const contract of [
    /jsonb_typeof\(payload\) is not distinct from 'object'/,
    /payload ->> 'version' is not distinct from 'v1'/,
    /jsonb_typeof\(payload -> 'log'\) is not distinct from 'object'/,
    /jsonb_typeof\(payload #> '\{log,sections\}'\) is not distinct from 'array'/,
    /jsonb_typeof\(payload -> 'linkedStrategyLabel'\) is not distinct from 'string'/
  ]) {
    assert.match(migration, contract);
  }
});

test("optional sorted cards may be absent, JSON null, or an array", () => {
  assert.match(
    migration,
    /not \(payload \? 'linkedDeckListSortedCards'\)[\s\S]*?jsonb_typeof\(payload -> 'linkedDeckListSortedCards'\) in \('array', 'null'\)/
  );
});

test("migration validates existing rows without rewriting shares or imposing a byte cap", () => {
  const sql = executableSql(migration);
  const addPosition = sql.indexOf("add constraint log_shares_payload_v1_envelope");
  const validatePosition = sql.indexOf(
    "validate constraint log_shares_payload_v1_envelope"
  );

  assert.ok(addPosition >= 0);
  assert.ok(validatePosition > addPosition);
  assert.match(sql, /\) not valid;/);
  assert.doesNotMatch(sql, /\b(?:insert|update|delete|truncate)\b/i);
  assert.doesNotMatch(sql, /pg_column_size|octet_length|length\s*\(/i);
});

test("linked schema health requires the exact validated envelope constraint", () => {
  assert.match(schemaHealth, /log_shares_payload_v1_envelope/);
  assert.match(
    schemaHealth,
    /NOT jsonb_typeof\(payload\) IS DISTINCT FROM 'object'::text/
  );
  assert.match(
    schemaHealth,
    /jsonb_typeof\(payload -> 'linkedDeckListSortedCards'::text\) = ANY/
  );
  assert.match(schemaHealth, /actualConstraints\.get\(name\)\?\.validated !== true/);
});
