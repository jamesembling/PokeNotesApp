import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migrationSql = readFileSync(
  join(process.cwd(), "sql/2026-04-26-deck-log-stats-read-model.sql"),
  "utf8"
);

function compactSql(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

test("deck_log_stats migration installs write-through triggers for insert, delete, result update, and relink", () => {
  const sql = compactSql(migrationSql);

  assert.match(sql, /create trigger refresh_deck_log_stats_after_insert after insert on public\.logs/);
  assert.match(sql, /create trigger refresh_deck_log_stats_after_delete after delete on public\.logs/);
  assert.match(
    sql,
    /create trigger refresh_deck_log_stats_after_link_update after update of user_id, result, linked_deck_id on public\.logs/
  );
});

test("relinking a log refreshes both old and new deck_log_stats rows", () => {
  const sql = compactSql(migrationSql);

  assert.match(
    sql,
    /perform public\.refresh_deck_log_stats\(new\.user_id, new\.linked_deck_id\)/
  );
  assert.match(
    sql,
    /old\.linked_deck_id is distinct from new\.linked_deck_id/
  );
  assert.match(
    sql,
    /perform public\.refresh_deck_log_stats\(old\.user_id, old\.linked_deck_id\)/
  );
});

test("changing a log result refreshes deck_log_stats win and loss counts", () => {
  const sql = compactSql(migrationSql);

  assert.match(
    sql,
    /after update of user_id, result, linked_deck_id on public\.logs/
  );
  assert.match(sql, /count\(\*\) filter \(where result = 'win'\)::bigint/);
  assert.match(sql, /count\(\*\) filter \(where result = 'loss'\)::bigint/);
  assert.match(sql, /games_won = excluded\.games_won/);
  assert.match(sql, /games_lost = excluded\.games_lost/);
});

test("deleting the last linked log removes the deck_log_stats row", () => {
  const sql = compactSql(migrationSql);

  assert.match(
    sql,
    /create trigger refresh_deck_log_stats_after_delete after delete on public\.logs/
  );
  assert.match(
    sql,
    /if coalesce\(next_games_played, 0\) = 0 then delete from public\.deck_log_stats where user_id = target_user_id and deck_id = target_deck_id/
  );
});

test("unlinking and relinking from null are covered by the same relink trigger", () => {
  const sql = compactSql(migrationSql);

  assert.match(sql, /old\.linked_deck_id is distinct from new\.linked_deck_id/);
  assert.match(sql, /nullif\(target_deck_id, ''\) is null then return/);
  assert.match(
    sql,
    /perform public\.refresh_deck_log_stats\(old\.user_id, old\.linked_deck_id\)/
  );
  assert.match(
    sql,
    /perform public\.refresh_deck_log_stats\(new\.user_id, new\.linked_deck_id\)/
  );
});

test("deck_log_stats backfill is sourced from linked logs and existing decks", () => {
  const sql = compactSql(migrationSql);

  assert.match(sql, /insert into public\.deck_log_stats/);
  assert.match(sql, /from public\.logs l join public\.decks d on d\.id = l\.linked_deck_id and d\.user_id = l\.user_id/);
  assert.match(sql, /where l\.linked_deck_id is not null group by l\.user_id, l\.linked_deck_id/);
});

test("log import, edit, bulk relink, and delete actions write through logs table", () => {
  const source = compactSql(
    readFileSync(join(process.cwd(), "app/(app)/logs/actions.ts"), "utf8")
  );

  assert.match(source, /from\("logs"\)\.insert/);
  assert.match(source, /from\("logs"\) \.update\(\{[^}]*linked_deck_id: linkeddeckid \|\| null/);
  assert.match(source, /from\("logs"\) \.update\(\{ linked_deck_id: linkeddeckid, linked_deck_list_id: linkeddecklistid \}\)/);
  assert.match(source, /from\("logs"\) \.delete\(\)/);
});
