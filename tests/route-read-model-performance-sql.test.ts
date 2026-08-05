import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationsDirectory = new URL("../supabase/migrations/", import.meta.url);
const routeMigrationFilename = "20260725224841_optimize_route_read_models.sql";
const migration = readFileSync(
  new URL(routeMigrationFilename, migrationsDirectory),
  "utf8"
);

test("route read model source history matches the authoritative migration ledger", () => {
  const migrationFilenames = readdirSync(migrationsDirectory);
  const routeMigrations = migrationFilenames.filter((filename) =>
    filename.endsWith("_optimize_route_read_models.sql")
  );

  assert.deepEqual(routeMigrations, [routeMigrationFilename]);
  assert.deepEqual(
    migrationFilenames.filter((filename) => filename.startsWith("20260725224841_")),
    [routeMigrationFilename]
  );
  assert.equal(
    routeMigrations.some((filename) => filename.startsWith("20260725221213_")),
    false
  );
});

test("deck index page data combines deck summaries and stats in one tenant-scoped read", () => {
  assert.match(migration, /function public\.get_deck_index_page_data\(\)/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /select \(select auth\.uid\(\)\) as user_id/i);
  assert.match(migration, /where decks\.user_id = request_context\.user_id/i);
  assert.match(
    migration,
    /deck_log_stats\.user_id = request_context\.user_id[\s\S]*deck_log_stats\.deck_id = decks\.id/i
  );
  assert.match(
    migration,
    /revoke execute on function public\.get_deck_index_page_data\(\) from public, anon/i
  );
  assert.match(
    migration,
    /grant execute on function public\.get_deck_index_page_data\(\) to authenticated/i
  );
});

test("logs read model skips legacy deck JSON when the relational list exists", () => {
  assert.match(
    migration,
    /left join public\.decks[\s\S]*on relational_list\.id is null[\s\S]*decks\.user_id = ordered_logs\.user_id/i
  );
  assert.match(
    migration,
    /where relational_list\.id is null[\s\S]*deck_list ->> 'id' = ordered_logs\.linked_deck_list_id/i
  );
  assert.match(
    migration,
    /coalesce\(relational_list\.name, aggregate_list\.name\) as linked_deck_list_name/i
  );
  assert.match(
    migration,
    /order by logs\.date desc, logs\.imported_at desc, logs\.id desc/i
  );
});
