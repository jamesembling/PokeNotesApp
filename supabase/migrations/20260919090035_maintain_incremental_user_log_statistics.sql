begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Serialize the cutover with log writes and seed exact totals before commit.
lock table public.logs in share row exclusive mode;

drop trigger refresh_user_log_stats_after_insert on public.logs;
drop trigger refresh_user_log_stats_after_delete on public.logs;
drop trigger refresh_user_log_stats_after_stats_update on public.logs;

create or replace function public.sync_user_log_stats_from_log_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_rows_sql text;
  delta record;
begin
  -- Transition tables contain only this statement's changed rows. The fixed SQL
  -- branches avoid referencing an OLD/NEW table that the event does not supply.
  case tg_op
    when 'INSERT' then
      changed_rows_sql := 'select 1 as direction, n.* from new_log_rows n';
    when 'DELETE' then
      changed_rows_sql := 'select -1 as direction, o.* from old_log_rows o';
    when 'UPDATE' then
      changed_rows_sql := 'select -1 as direction, o.* from old_log_rows o
                          union all select 1 as direction, n.* from new_log_rows n';
    else
      raise exception 'Unsupported log statistics event: %', tg_op;
  end case;

  -- Aggregate the change once per account, even for bulk writes. Sorting the
  -- accounts gives cross-account operations a consistent lock order.
  for delta in execute format($changes$
    select
      user_id,
      sum(direction)::bigint as games_played,
      sum(case when result = 'Win' then direction else 0 end)::bigint as games_won,
      sum(case when result = 'Loss' then direction else 0 end)::bigint as games_lost,
      sum(direction::bigint * coalesce(self_attack_damage, 0))::bigint as attack_damage,
      sum(direction::bigint * coalesce(opponent_attack_damage, 0))::bigint as opponent_attack_damage,
      sum(case when coin_toss_won is true then direction else 0 end)::bigint as coin_flips_won,
      sum(case when coin_toss_won is false then direction else 0 end)::bigint as coin_flips_lost,
      sum(direction::bigint * coalesce(self_mulligans, 0))::bigint as mulligans_taken,
      sum(direction::bigint * coalesce(self_prizes_taken, 0))::bigint as prizes_taken,
      sum(direction::bigint * coalesce(self_attack_damage + opponent_attack_damage, 0))::bigint as tracked_damage,
      sum(direction::bigint * coalesce(self_prizes_taken + opponent_prizes_taken, 0))::bigint as tracked_prizes
    from (%s) changed_rows
    where user_id is not null
    group by user_id
    order by user_id
  $changes$, changed_rows_sql)
  loop
    -- Notes, deck links, and same-value retries contribute nothing to totals.
    if (delta.games_played, delta.games_won, delta.games_lost,
        delta.attack_damage, delta.opponent_attack_damage,
        delta.coin_flips_won, delta.coin_flips_lost, delta.mulligans_taken,
        delta.prizes_taken, delta.tracked_damage, delta.tracked_prizes)
       = (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0) then
      continue;
    end if;

    -- Share the rebuild's transaction lock so a repair cannot race an increment.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('user_log_stats:' || delta.user_id::text, 0)
    );

    update public.user_log_stats as stats
    set games_played = stats.games_played + delta.games_played,
        games_won = stats.games_won + delta.games_won,
        games_lost = stats.games_lost + delta.games_lost,
        attack_damage = stats.attack_damage + delta.attack_damage,
        opponent_attack_damage = stats.opponent_attack_damage + delta.opponent_attack_damage,
        coin_flips_won = stats.coin_flips_won + delta.coin_flips_won,
        coin_flips_lost = stats.coin_flips_lost + delta.coin_flips_lost,
        mulligans_taken = stats.mulligans_taken + delta.mulligans_taken,
        prizes_taken = stats.prizes_taken + delta.prizes_taken,
        tracked_damage = stats.tracked_damage + delta.tracked_damage,
        tracked_prizes = stats.tracked_prizes + delta.tracked_prizes,
        updated_at = now()
    where stats.user_id = delta.user_id;

    if not found and exists (select 1 from auth.users where id = delta.user_id) then
      -- First save or a missing summary: rebuild once after the whole statement,
      -- including all of its rows. Applying its delta as well would count twice.
      -- A deleted account must not have its cascading summary recreated.
      perform public.refresh_user_log_stats(delta.user_id);
    end if;
  end loop;

  return null;
end;
$$;

create trigger refresh_user_log_stats_after_insert
  after insert on public.logs
  referencing new table as new_log_rows
  for each statement execute function public.sync_user_log_stats_from_log_row();

create trigger refresh_user_log_stats_after_delete
  after delete on public.logs
  referencing old table as old_log_rows
  for each statement execute function public.sync_user_log_stats_from_log_row();

create trigger refresh_user_log_stats_after_stats_update
  after update on public.logs
  referencing old table as old_log_rows new table as new_log_rows
  for each statement execute function public.sync_user_log_stats_from_log_row();

comment on table public.user_log_stats is
  'Per-user stats totals maintained from log changes. refresh_user_log_stats rebuilds totals for verification and recovery.';

-- The existing full rebuild remains the independent source of truth for repair.
-- The log rows, RLS, grants, and function ownership are unchanged.
do $$
declare
  account_id uuid;
begin
  for account_id in
    select user_id from public.logs
    union
    select user_id from public.user_log_stats
    order by user_id
  loop
    perform public.refresh_user_log_stats(account_id);
  end loop;
end;
$$;

commit;
