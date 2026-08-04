import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migrationSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260804224244_add_coin_toss_losses_to_stats.sql"
  ),
  "utf8"
);

function compactSql(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

test("coin toss stats use the named winner sentence as their source of truth", () => {
  const sql = compactSql(migrationSql);

  assert.match(
    sql,
    /add column if not exists coin_flips_lost bigint not null default 0/
  );
  assert.match(
    sql,
    /position\(self_player_name \|\| ' won the coin toss' in raw_log\) > 0/
  );
  assert.match(
    sql,
    /position\(opponent_player_name \|\| ' won the coin toss' in raw_log\) > 0/
  );
  assert.doesNotMatch(sql, /where coin_toss_won is (?:true|false)/);
  assert.doesNotMatch(sql, /games_played\s*-\s*coin_flips_won/);
});

test("coin toss loss rollup is backfilled, refreshed, and returned by the stats RPC", () => {
  const sql = compactSql(migrationSql);

  assert.match(
    sql,
    /update public\.user_log_stats as stats set coin_flips_won = source\.coin_flips_won, coin_flips_lost = source\.coin_flips_lost/
  );
  assert.match(sql, /coin_flips_lost = excluded\.coin_flips_lost/);
  assert.match(
    sql,
    /after update of user_id, result, raw_log, self_player_name, opponent_player_name/
  );
  assert.match(
    sql,
    /returns table \([^)]*coin_flips_won bigint, coin_flips_lost bigint[^)]*\)/
  );
  assert.match(sql, /coalesce\(stats\.coin_flips_lost, 0\)::bigint as coin_flips_lost/);
});
