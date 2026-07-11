import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260711224858_enforce_log_share_payload_size.sql",
    import.meta.url
  ),
  "utf8"
);
const schema = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");
const schemaHealth = readFileSync(
  new URL("../scripts/schema-health.mjs", import.meta.url),
  "utf8"
);

test("share snapshots are capped at the approved 256 KiB database boundary", () => {
  for (const source of [migration, schema]) {
    assert.match(source, /log_shares_payload_max_256k/);
    assert.match(source, /octet_length\(payload::text\) <= 262144/);
    assert.match(source, /LOG_SHARE_PAYLOAD_TOO_LARGE/);
  }

  assert.match(migration, /add constraint log_shares_payload_max_256k[\s\S]*?not valid/);
  assert.match(migration, /validate constraint log_shares_payload_max_256k/);
});

test("the share creator fails before insert with a stable oversized-payload code", () => {
  const sizeCheck = migration.indexOf("LOG_SHARE_PAYLOAD_TOO_LARGE");
  const insert = migration.indexOf("insert into public.log_shares");

  assert.ok(sizeCheck > 0);
  assert.ok(insert > sizeCheck);
  assert.match(
    migration,
    /revoke all on function public\.create_log_share\(text, text, jsonb\)[\s\S]*?grant execute[\s\S]*?to authenticated, service_role/
  );
});

test("linked schema health requires both the cap and stable function guard", () => {
  assert.match(schemaHealth, /log_shares_payload_max_256k/);
  assert.match(schemaHealth, /CHECK \(octet_length\(payload::text\) <= 262144\)/);
  assert.match(schemaHealth, /share_creator_has_stable_payload_limit/);
});
