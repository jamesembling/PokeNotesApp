import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20260711204150_enforce_log_share_payload_envelope.sql",
  import.meta.url
);
const schemaPath = new URL("../schema.sql", import.meta.url);

const migration = readFileSync(migrationPath, "utf8").trim();
const schema = readFileSync(schemaPath, "utf8");

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
