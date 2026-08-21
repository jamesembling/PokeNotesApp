import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationName = "20260821000033_make_log_share_lifecycle_atomic.sql";
const migration = readFileSync(
  new URL(`../supabase/migrations/${migrationName}`, import.meta.url),
  "utf8"
);
const schema = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");
const schemaHealth = readFileSync(
  new URL("../scripts/schema-health.mjs", import.meta.url),
  "utf8"
);
const rolloutRunbook = readFileSync(
  new URL("../docs/log-share-atomic-rollout.md", import.meta.url),
  "utf8"
);

function atomicLifecycleBlock(source: string) {
  const start = source.lastIndexOf(
    "-- Serialize share creation and revocation per owner/log"
  );
  const endMarker = "-- End atomic log-share lifecycle boundary.";
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, "missing atomic lifecycle start marker");
  assert.notEqual(end, -1, "missing atomic lifecycle end marker");
  return source.slice(start, end + endMarker.length);
}

test("fresh schema and forward migration keep the atomic RPC contract", () => {
  for (const source of [atomicLifecycleBlock(schema), atomicLifecycleBlock(migration)]) {
    assert.match(source, /create or replace function public\.create_log_share/);
    assert.match(source, /create or replace function public\.revoke_log_share/);
    assert.match(source, /pg_advisory_xact_lock/g);
    assert.match(source, /duplicate_share\.id <> active_share\.id/);
    assert.match(source, /owned_share\.source_log_id = target_source_log_id/);
  }
});

test("the migration is a forward migration after the current live head", () => {
  assert.equal(existsSync(new URL(`../supabase/migrations/${migrationName}`, import.meta.url)), true);
  assert.equal(
    existsSync(
      new URL(
        "../supabase/migrations/20260804212228_harden_log_share_writes_after_atomic_cutover.sql",
        import.meta.url
      )
    ),
    false
  );
  assert.ok("20260821000033" > "20260804224244");
  assert.doesNotMatch(migration, /revoke\s+(?:insert, update, delete|delete).*public\.log_shares.*authenticated/i);
  assert.match(migration, /Keep its existing table grant/);
});

test("RPCs are authenticated and the compatibility DELETE remains available", () => {
  assert.match(migration, /security definer\s+set search_path = ''/g);
  assert.match(migration, /current_user_id uuid := auth\.uid\(\)/g);
  assert.match(
    migration,
    /revoke all on function public\.revoke_log_share\(text\)[\s\S]*?grant execute[\s\S]*?to authenticated, service_role;/
  );
  assert.match(schema, /grant select, delete on table public\.log_shares to authenticated;/);
  assert.match(schemaHealth, /authenticated_can_use_atomic_share_revoker/);
  assert.doesNotMatch(schemaHealth, /authenticated_cannot_delete_log_shares_directly/);
});

test("release documentation names the exact migration and controlled workflow", () => {
  assert.match(rolloutRunbook, new RegExp(migrationName.replaceAll(".", "\\.")));
  assert.match(rolloutRunbook, /manually dispatched \*\*Deploy\s+production database\*\*/);
  assert.match(rolloutRunbook, /existing authenticated table `DELETE` grant/);
  assert.doesNotMatch(rolloutRunbook, /post-hardening|share-phase-two|20260804212228/);
});
