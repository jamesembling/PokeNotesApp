import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260804210800_make_log_share_lifecycle_atomic.sql",
    import.meta.url
  ),
  "utf8"
);
const schema = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");
const schemaHealth = readFileSync(
  new URL("../scripts/schema-health.mjs", import.meta.url),
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

test("migration and fresh-install schema keep the same atomic lifecycle contract", () => {
  for (const source of [atomicLifecycleBlock(schema), atomicLifecycleBlock(migration)]) {
    assert.match(source, /create or replace function public\.create_log_share/);
    assert.match(source, /create or replace function public\.revoke_log_share/);
    assert.match(source, /pg_advisory_xact_lock/g);
    assert.match(source, /duplicate_share\.id <> active_share\.id/);
    assert.match(source, /owned_share\.source_log_id = target_source_log_id/);
    assert.match(source, /revoke insert, update, delete on table public\.log_shares/);
  }
});

test("get-or-create serializes per tenant and source before selecting or inserting", () => {
  const createFunction = migration.slice(
    migration.indexOf("create or replace function public.create_log_share"),
    migration.indexOf("create or replace function public.revoke_log_share")
  );
  const lock = createFunction.indexOf("pg_advisory_xact_lock");
  const activeRead = createFunction.indexOf("select share.*");
  const insert = createFunction.indexOf("insert into public.log_shares");

  assert.ok(lock > 0);
  assert.ok(activeRead > lock);
  assert.ok(insert > activeRead);
  assert.match(
    createFunction,
    /current_user_id::text \|\| ':' \|\| p_source_log_id/
  );
  assert.match(
    createFunction,
    /share\.owner_user_id = current_user_id[\s\S]*?share\.source_log_id = p_source_log_id[\s\S]*?share\.expires_at > created_time/
  );
  assert.match(createFunction, /order by share\.created_at desc, share\.id desc/);
  assert.match(
    createFunction,
    /duplicate_share\.id <> active_share\.id[\s\S]*?duplicate_share\.expires_at > created_time/
  );
});

test("revocation shares the lock key and removes all owner-scoped duplicates", () => {
  const revokeFunction = migration.slice(
    migration.indexOf("create or replace function public.revoke_log_share"),
    migration.indexOf("revoke all on function public.create_log_share")
  );

  assert.match(
    revokeFunction,
    /where share\.id = p_share_id\s+and share\.owner_user_id = current_user_id/
  );
  assert.match(revokeFunction, /pg_advisory_xact_lock/);
  assert.match(
    revokeFunction,
    /owned_share\.owner_user_id = current_user_id\s+and owned_share\.source_log_id = target_source_log_id/
  );
  assert.match(revokeFunction, /if target_source_log_id is null/);
});

test("only authenticated callers can mutate shares and direct writes are removed", () => {
  assert.match(migration, /security definer\s+set search_path = ''/g);
  assert.match(migration, /current_user_id uuid := auth\.uid\(\)/g);
  assert.match(
    migration,
    /revoke all on function public\.revoke_log_share\(text\)[\s\S]*?from public, anon, authenticated, service_role;[\s\S]*?grant execute[\s\S]*?to authenticated, service_role;/
  );
  assert.match(
    migration,
    /revoke insert, update, delete on table public\.log_shares from authenticated;/
  );
  assert.doesNotMatch(migration, /grant execute[\s\S]*?revoke_log_share[\s\S]*?to anon/);
});

test("linked schema health checks atomicity, access and direct-write removal", () => {
  for (const contract of [
    "authenticated_cannot_delete_log_shares_directly",
    "authenticated_can_use_atomic_share_revoker",
    "anon_cannot_revoke_log_shares",
    "share_creator_is_owner_source_atomic",
    "share_revoker_is_owner_source_atomic"
  ]) {
    assert.match(schemaHealth, new RegExp(contract));
  }
});
