alter table public.user_log_stats
  add column if not exists coin_flips_lost bigint not null default 0;

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
    count(*) filter (
      where nullif(self_player_name, '') is not null
        and position(self_player_name || ' won the coin toss' in raw_log) > 0
        and (
          nullif(opponent_player_name, '') is null
          or position(opponent_player_name || ' won the coin toss' in raw_log) = 0
        )
    )::bigint as coin_flips_won,
    count(*) filter (
      where nullif(opponent_player_name, '') is not null
        and position(opponent_player_name || ' won the coin toss' in raw_log) > 0
        and (
          nullif(self_player_name, '') is null
          or position(self_player_name || ' won the coin toss' in raw_log) = 0
        )
    )::bigint as coin_flips_lost,
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

update public.user_log_stats as stats
set coin_flips_won = source.coin_flips_won,
    coin_flips_lost = source.coin_flips_lost,
    updated_at = now()
from (
  select
    user_id,
    count(*) filter (
      where nullif(self_player_name, '') is not null
        and position(self_player_name || ' won the coin toss' in raw_log) > 0
        and (
          nullif(opponent_player_name, '') is null
          or position(opponent_player_name || ' won the coin toss' in raw_log) = 0
        )
    )::bigint as coin_flips_won,
    count(*) filter (
      where nullif(opponent_player_name, '') is not null
        and position(opponent_player_name || ' won the coin toss' in raw_log) > 0
        and (
          nullif(self_player_name, '') is null
          or position(self_player_name || ' won the coin toss' in raw_log) = 0
        )
    )::bigint as coin_flips_lost
  from public.logs
  group by user_id
) as source
where source.user_id = stats.user_id;

drop trigger if exists refresh_user_log_stats_after_stats_update on public.logs;
create trigger refresh_user_log_stats_after_stats_update
  after update of user_id, result, raw_log, self_player_name, opponent_player_name,
    self_prizes_taken, opponent_prizes_taken, self_attack_damage,
    opponent_attack_damage, self_mulligans
  on public.logs
  for each row execute function public.sync_user_log_stats_from_log_row();

drop function if exists public.get_log_stats_overview();

create function public.get_log_stats_overview()
returns table (
  games_played bigint,
  games_won bigint,
  games_lost bigint,
  attack_damage bigint,
  opponent_attack_damage bigint,
  coin_flips_won bigint,
  coin_flips_lost bigint,
  mulligans_taken bigint,
  prizes_taken bigint,
  tracked_damage bigint,
  tracked_prizes bigint
)
language sql
security invoker
set search_path = public
as $$
  select
    coalesce(stats.games_played, 0)::bigint as games_played,
    coalesce(stats.games_won, 0)::bigint as games_won,
    coalesce(stats.games_lost, 0)::bigint as games_lost,
    coalesce(stats.attack_damage, 0)::bigint as attack_damage,
    coalesce(stats.opponent_attack_damage, 0)::bigint as opponent_attack_damage,
    coalesce(stats.coin_flips_won, 0)::bigint as coin_flips_won,
    coalesce(stats.coin_flips_lost, 0)::bigint as coin_flips_lost,
    coalesce(stats.mulligans_taken, 0)::bigint as mulligans_taken,
    coalesce(stats.prizes_taken, 0)::bigint as prizes_taken,
    coalesce(stats.tracked_damage, 0)::bigint as tracked_damage,
    coalesce(stats.tracked_prizes, 0)::bigint as tracked_prizes
  from (select auth.uid() as user_id) user_scope
  left join public.user_log_stats stats
    on stats.user_id = user_scope.user_id;
$$;

grant execute on function public.get_log_stats_overview() to public;
grant execute on function public.get_log_stats_overview() to anon;
grant execute on function public.get_log_stats_overview() to authenticated;
grant execute on function public.get_log_stats_overview() to service_role;
