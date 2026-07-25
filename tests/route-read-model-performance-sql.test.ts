import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260725221213_optimize_route_read_models.sql",
    import.meta.url
  ),
  "utf8"
);

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
