import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260723122331_optimize_logs_initial_read_model.sql",
    import.meta.url
  ),
  "utf8"
);

test("initial logs read model is invoker-scoped to the authenticated tenant", () => {
  assert.match(migration, /security invoker/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /select \(select auth\.uid\(\)\) as user_id/i);
  assert.match(migration, /where logs\.user_id = request_context\.user_id/i);
  assert.match(
    migration,
    /user_log_stats\.user_id = request_context\.user_id/i
  );
  assert.match(
    migration,
    /revoke execute on function public\.get_initial_logs_page_data\(integer\) from public, anon/i
  );
  assert.match(
    migration,
    /grant execute on function public\.get_initial_logs_page_data\(integer\) to authenticated/i
  );
});

test("initial logs read model preserves stable ordering and linked-list compatibility", () => {
  assert.match(
    migration,
    /order by logs\.date desc, logs\.imported_at desc, logs\.id desc/i
  );
  assert.match(
    migration,
    /relational_list\.user_id = ordered_logs\.user_id[\s\S]*relational_list\.deck_id = ordered_logs\.linked_deck_id[\s\S]*relational_list\.id = ordered_logs\.linked_deck_list_id/i
  );
  assert.match(
    migration,
    /decks\.user_id = ordered_logs\.user_id[\s\S]*decks\.id = ordered_logs\.linked_deck_id/i
  );
  assert.match(
    migration,
    /when jsonb_typeof\(decks\.deck_lists\) = 'array' then decks\.deck_lists[\s\S]*else '\[\]'::jsonb/i
  );
  assert.match(
    migration,
    /where deck_list ->> 'id' = ordered_logs\.linked_deck_list_id/i
  );
  assert.match(
    migration,
    /coalesce\(relational_list\.name, aggregate_list\.name\) as linked_deck_list_name/i
  );
});
