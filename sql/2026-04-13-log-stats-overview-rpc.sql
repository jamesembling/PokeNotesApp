create or replace function public.get_log_stats_overview()
returns table (
  games_played bigint,
  games_won bigint,
  games_lost bigint,
  attack_damage bigint,
  opponent_attack_damage bigint,
  coin_flips_won bigint,
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
    count(*)::bigint as games_played,
    count(*) filter (where result = 'Win')::bigint as games_won,
    count(*) filter (where result = 'Loss')::bigint as games_lost,
    coalesce(sum(self_attack_damage), 0)::bigint as attack_damage,
    coalesce(sum(opponent_attack_damage), 0)::bigint as opponent_attack_damage,
    count(*) filter (where coin_toss_won is true)::bigint as coin_flips_won,
    coalesce(sum(self_mulligans), 0)::bigint as mulligans_taken,
    coalesce(sum(self_prizes_taken), 0)::bigint as prizes_taken,
    coalesce(sum(self_attack_damage + opponent_attack_damage), 0)::bigint as tracked_damage,
    coalesce(sum(self_prizes_taken + opponent_prizes_taken), 0)::bigint as tracked_prizes
  from public.logs
  where user_id = auth.uid();
$$;
