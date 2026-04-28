import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const matchupStatsSql = readFileSync(
  join(process.cwd(), "sql/2026-04-28-dedupe-archetype-matchup-stats.sql"),
  "utf8"
);

function compactSql(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

test("user_archetype_matchup_stats migration creates the compact stats read model", () => {
  const sql = compactSql(matchupStatsSql);

  assert.match(sql, /create table public\.user_archetype_matchup_stats/);
  assert.match(sql, /matchup_key text not null/);
  assert.match(sql, /source_deck_slugs text not null default ''/);
  assert.match(sql, /primary key \(user_id, matchup_key\)/);
  assert.match(sql, /games_played bigint not null default 0/);
  assert.match(sql, /games_won bigint not null default 0/);
  assert.match(sql, /games_lost bigint not null default 0/);
  assert.match(sql, /create index if not exists user_archetype_matchup_stats_user_sort/);
});

test("archetype matchup stats refresh only the affected opponent archetype bucket", () => {
  const sql = compactSql(matchupStatsSql);

  assert.match(
    sql,
    /create or replace function public\.refresh_user_archetype_matchup_stats\( target_user_id uuid, target_matchup_key text \)/
  );
  assert.match(sql, /where user_id = target_user_id and public\.get_archetype_matchup_key\( opponent_deck_slug, opponent_deck_name, opponent_deck_sprites \) = normalized_key/);
  assert.match(sql, /if coalesce\(next_games_played, 0\) = 0 then delete from public\.user_archetype_matchup_stats/);
  assert.match(sql, /coalesce\( nullif\(trim\(coalesce\(target_opponent_deck_sprites, ''\)\), ''\), nullif\(trim\(coalesce\(target_opponent_deck_name, ''\)\), ''\), nullif\(trim\(coalesce\(target_opponent_deck_slug, ''\)\), ''\) \)/);
});

test("archetype matchup stats migration installs write-through triggers for log changes", () => {
  const sql = compactSql(matchupStatsSql);

  assert.match(sql, /create trigger refresh_user_archetype_matchup_stats_after_insert after insert on public\.logs/);
  assert.match(sql, /create trigger refresh_user_archetype_matchup_stats_after_delete after delete on public\.logs/);
  assert.match(
    sql,
    /create trigger refresh_user_archetype_matchup_stats_after_matchup_update after update of user_id, result, date, opponent_deck_slug, opponent_deck_name, opponent_deck_sprites on public\.logs/
  );
});

test("renaming or changing an opponent archetype refreshes old and new read-model rows", () => {
  const sql = compactSql(matchupStatsSql);

  assert.match(
    sql,
    /public\.get_archetype_matchup_key\(new\.opponent_deck_slug, new\.opponent_deck_name, new\.opponent_deck_sprites\)/
  );
  assert.match(sql, /is distinct from public\.get_archetype_matchup_key\(new\.opponent_deck_slug, new\.opponent_deck_name, new\.opponent_deck_sprites\)/);
  assert.match(
    sql,
    /public\.get_archetype_matchup_key\(old\.opponent_deck_slug, old\.opponent_deck_name, old\.opponent_deck_sprites\)/
  );
});

test("archetype matchup stats are backfilled from stored battle logs", () => {
  const sql = compactSql(matchupStatsSql);

  assert.match(sql, /insert into public\.user_archetype_matchup_stats/);
  assert.match(sql, /from public\.logs where public\.get_archetype_matchup_key\(opponent_deck_slug, opponent_deck_name, opponent_deck_sprites\) is not null/);
  assert.match(sql, /group by user_id, public\.get_archetype_matchup_key\(opponent_deck_slug, opponent_deck_name, opponent_deck_sprites\)/);
  assert.match(sql, /string_agg\(distinct nullif\(trim\(opponent_deck_slug\), ''\), ',' order by nullif\(trim\(opponent_deck_slug\), ''\)\)/);
  assert.match(sql, /count\(\*\) filter \(where result = 'win'\)::bigint as games_won/);
  assert.match(sql, /count\(\*\) filter \(where result = 'loss'\)::bigint as games_lost/);
});

test("archetype matchup stats maintenance functions are not executable by normal users", () => {
  const sql = compactSql(matchupStatsSql);

  assert.match(sql, /revoke all on function public\.get_archetype_matchup_key\(text, text, text\) from public/);
  assert.match(sql, /revoke all on function public\.get_archetype_matchup_key\(text, text, text\) from anon/);
  assert.match(sql, /revoke all on function public\.get_archetype_matchup_key\(text, text, text\) from authenticated/);
  assert.match(sql, /revoke all on function public\.refresh_user_archetype_matchup_stats\(uuid, text\) from public/);
  assert.match(sql, /revoke all on function public\.refresh_user_archetype_matchup_stats\(uuid, text\) from anon/);
  assert.match(sql, /revoke all on function public\.refresh_user_archetype_matchup_stats\(uuid, text\) from authenticated/);
  assert.match(sql, /revoke all on function public\.sync_user_archetype_matchup_stats_from_log_row\(\) from public/);
  assert.match(sql, /revoke all on function public\.sync_user_archetype_matchup_stats_from_log_row\(\) from anon/);
  assert.match(sql, /revoke all on function public\.sync_user_archetype_matchup_stats_from_log_row\(\) from authenticated/);
});

test("users can only read their own archetype matchup stats", () => {
  const sql = compactSql(matchupStatsSql);

  assert.match(sql, /alter table public\.user_archetype_matchup_stats enable row level security/);
  assert.match(sql, /create policy "users can read own archetype matchup stats"/);
  assert.match(sql, /using \(auth\.uid\(\) = user_id\)/);
});
