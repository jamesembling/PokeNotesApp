-- The parser's account-aware result is authoritative. In particular, raw_log
-- retains alternate usernames while self_player_name uses the primary username.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Freeze log mutations across the backfill and summary refresh. Lock acquisition
-- is bounded, and any timeout rolls the entire migration back.
lock table public.logs in share row exclusive mode;

-- Avoid a summary rebuild per historical row, and preserve log edit timestamps.
drop trigger refresh_user_log_stats_after_stats_update on public.logs;
alter table public.logs disable trigger set_logs_updated_at;
alter table public.logs disable trigger log_search_vector_update;
alter table public.logs disable trigger clear_orphaned_log_deck_list_link;

-- Only fill unknown results with unambiguous evidence under the previous
-- classification rules. Existing parser results and original log text survive.
with historical_tosses as (
  select
    id,
    nullif(self_player_name, '') is not null
      and position(self_player_name || ' won the coin toss' in raw_log) > 0 as self_won,
    nullif(opponent_player_name, '') is not null
      and position(opponent_player_name || ' won the coin toss' in raw_log) > 0 as opponent_won
  from public.logs
  where coin_toss_won is null
)
update public.logs as log
set coin_toss_won = toss.self_won
from historical_tosses as toss
where log.id = toss.id
  and toss.self_won <> toss.opponent_won;

alter table public.logs enable trigger set_logs_updated_at;
alter table public.logs enable trigger log_search_vector_update;
alter table public.logs enable trigger clear_orphaned_log_deck_list_link;

create or replace function public.refresh_user_log_stats(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_user_id is null then
    return;
  end if;

  -- A fresh snapshot after the lock sees the preceding committed log mutation.
  -- Without serialization, a waiting upsert can overwrite totals it read earlier.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('user_log_stats:' || target_user_id::text, 0)
  );

  insert into public.user_log_stats (
    user_id,
    games_played,
    games_won,
    games_lost,
    attack_damage,
    opponent_attack_damage,
    coin_flips_won,
    coin_flips_lost,
    mulligans_taken,
    prizes_taken,
    tracked_damage,
    tracked_prizes
  )
  select
    target_user_id,
    count(*)::bigint as games_played,
    count(*) filter (where result = 'Win')::bigint as games_won,
    count(*) filter (where result = 'Loss')::bigint as games_lost,
    coalesce(sum(self_attack_damage), 0)::bigint as attack_damage,
    coalesce(sum(opponent_attack_damage), 0)::bigint as opponent_attack_damage,
    count(*) filter (where coin_toss_won is true)::bigint as coin_flips_won,
    count(*) filter (where coin_toss_won is false)::bigint as coin_flips_lost,
    coalesce(sum(self_mulligans), 0)::bigint as mulligans_taken,
    coalesce(sum(self_prizes_taken), 0)::bigint as prizes_taken,
    coalesce(sum(self_attack_damage + opponent_attack_damage), 0)::bigint as tracked_damage,
    coalesce(sum(self_prizes_taken + opponent_prizes_taken), 0)::bigint as tracked_prizes
  from public.logs
  where user_id = target_user_id
  on conflict (user_id) do update
  set games_played = excluded.games_played,
      games_won = excluded.games_won,
      games_lost = excluded.games_lost,
      attack_damage = excluded.attack_damage,
      opponent_attack_damage = excluded.opponent_attack_damage,
      coin_flips_won = excluded.coin_flips_won,
      coin_flips_lost = excluded.coin_flips_lost,
      mulligans_taken = excluded.mulligans_taken,
      prizes_taken = excluded.prizes_taken,
      tracked_damage = excluded.tracked_damage,
      tracked_prizes = excluded.tracked_prizes,
      updated_at = now();
end;
$$;

create trigger refresh_user_log_stats_after_stats_update
  after update of user_id, result, coin_toss_won,
    self_prizes_taken, opponent_prizes_taken, self_attack_damage,
    opponent_attack_damage, self_mulligans
  on public.logs
  for each row execute function public.sync_user_log_stats_from_log_row();

-- Rebuild once per account, including existing zero-log summaries. The function
-- retains its existing ownership, privileges and transactional write behavior.
do $$
declare
  account_id uuid;
begin
  for account_id in
    select user_id from public.logs
    union
    select user_id from public.user_log_stats
  loop
    perform public.refresh_user_log_stats(account_id);
  end loop;
end;
$$;

commit;
