import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260821000033_make_log_share_lifecycle_atomic.sql", import.meta.url),
  "utf8"
);
const schema = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");

// Artifact policy only: runtime permissions and atomicity require a database rehearsal.
test("share rollout artifacts retain the compatibility DELETE grant", () => {
  assert.doesNotMatch(migration, /revoke\s+(?:insert, update, delete|delete).*public\.log_shares.*authenticated/i);
  assert.match(schema, /grant select, delete on table public\.log_shares to authenticated;/);
});
