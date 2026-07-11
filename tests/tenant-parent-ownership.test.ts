import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20260711172840_enforce_tenant_parent_ownership.sql",
  import.meta.url
);
const schemaHealthPath = new URL("../scripts/schema-health.mjs", import.meta.url);
const schemaPath = new URL("../schema.sql", import.meta.url);
const indexMigrationPath = new URL(
  "../supabase/migrations/20260711173032_index_tenant_parent_foreign_keys.sql",
  import.meta.url
);
const linkCleanupMigrationPath = new URL(
  "../supabase/migrations/20260711175105_clear_orphaned_deck_list_links.sql",
  import.meta.url
);

const migration = readFileSync(migrationPath, "utf8");
const schemaHealth = readFileSync(schemaHealthPath, "utf8");
const schema = readFileSync(schemaPath, "utf8");
const indexMigration = readFileSync(indexMigrationPath, "utf8");
const linkCleanupMigration = readFileSync(linkCleanupMigrationPath, "utf8");

const ownershipConstraints = [
  "deck_lists_owner_deck_fkey",
  "deck_matchups_owner_deck_fkey",
  "tournament_rounds_owner_tournament_fkey",
  "deck_log_stats_owner_deck_fkey",
  "logs_owner_linked_deck_fkey",
  "tournaments_owner_linked_deck_fkey"
];

test("tenant ownership migration validates every composite parent constraint", () => {
  for (const constraint of ownershipConstraints) {
    assert.match(migration, new RegExp(`add constraint ${constraint}`));
    assert.match(migration, new RegExp(`validate constraint ${constraint}`));
  }

  assert.match(migration, /foreign key \(user_id, deck_id\)/);
  assert.match(migration, /foreign key \(user_id, tournament_id\)/);
  assert.match(migration, /foreign key \(user_id, linked_deck_id\)/);
  assert.match(migration, /on delete set null \(linked_deck_id\)/);
});

test("log and tournament writes validate compatibility list links on the owned deck", () => {
  for (const table of ["logs", "tournaments"]) {
    for (const operation of ["insert", "update"]) {
      const policyStart = migration.indexOf(
        `alter policy \"Users can ${operation} own ${table}\"`
      );
      assert.notEqual(policyStart, -1);
      const policyEnd = migration.indexOf(";", policyStart);
      const policy = migration.slice(policyStart, policyEnd + 1);

      assert.match(policy, /parent\.user_id = \(select auth\.uid\(\)\)/);
      assert.match(policy, /jsonb_array_elements/);
      assert.match(policy, new RegExp(`${table}\\.linked_deck_list_id`));
    }
  }
});

test("linked schema health checks require validated constraints and scoped policies", () => {
  for (const constraint of ownershipConstraints) {
    assert.match(schemaHealth, new RegExp(constraint));
  }

  assert.match(schemaHealth, /Missing, unvalidated, or changed constraints/);
  assert.match(schemaHealth, /linked_deck_list_writes_require_owned_parent/);
  assert.match(schemaHealth, /tournament_rounds_user_tournament/);
  assert.match(schemaHealth, /tournaments_user_linked_deck/);
});

test("new composite foreign keys have covering child indexes", () => {
  assert.match(
    indexMigration,
    /tournament_rounds_user_tournament[\s\S]*\(user_id, tournament_id\)/
  );
  assert.match(
    indexMigration,
    /tournaments_user_linked_deck[\s\S]*\(user_id, linked_deck_id\)/
  );
});

test("deck unlinking clears the dependent list id before enforcing coherence", () => {
  assert.match(
    linkCleanupMigration,
    /if new\.linked_deck_id is null then\s+new\.linked_deck_list_id := null;/
  );
  assert.match(
    linkCleanupMigration,
    /create trigger clear_orphaned_log_deck_list_link\s+before insert or update on public\.logs/
  );
  assert.match(
    linkCleanupMigration,
    /create trigger clear_orphaned_tournament_deck_list_link\s+before insert or update on public\.tournaments/
  );
  assert.match(
    linkCleanupMigration,
    /check \(linked_deck_id is not null or linked_deck_list_id is null\)/
  );
});

test("schema health checks ownership object definitions and retired keys", () => {
  assert.match(schemaHealth, /pg_get_constraintdef\(oid, true\)/);
  assert.match(schemaHealth, /REQUIRED_INDEX_DEFINITIONS/);
  assert.match(schemaHealth, /superseded_id_only_parent_keys_are_absent/);
  assert.match(schemaHealth, /optional_deck_links_are_coherent/);
  assert.match(schemaHealth, /optional_deck_link_cleanup_triggers_are_active/);
});

test("the canonical schema reapplies scoped link policies after RLS optimization", () => {
  const optimization = schema.lastIndexOf("Cache the caller identity once per statement");
  const finalPolicy = schema.lastIndexOf(
    "The final bootstrap policies retain tenant-scoped deck/list validation"
  );

  assert(optimization >= 0);
  assert(finalPolicy > optimization);
});
