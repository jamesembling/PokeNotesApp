-- Authoritative per-user matchup rollup for fast /stats rendering.
-- Updated from battle-log writes so page renders never aggregate logs live.

create table if not exists public.user_archetype_matchup_stats (
  user_id               uuid not null references auth.users(id) on delete cascade,
  opponent_deck_slug    text not null,
  opponent_deck_name    text not null default '',
  opponent_deck_sprites text not null default '',
  games_played          bigint not null default 0,
  games_won             bigint not null default 0,
  games_lost            bigint not null default 0,
  last_played_date      date,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  primary key (user_id, opponent_deck_slug)
);

comment on table public.user_archetype_matchup_stats is
  'Per-user opponent archetype matchup rollup for the stats page. Updated whenever battle-log matchup fields change.';

grant select on table public.user_archetype_matchup_stats to authenticated;
grant all privileges on table public.user_archetype_matchup_stats to service_role;

create index if not exists user_archetype_matchup_stats_user_sort
  on public.user_archetype_matchup_stats (user_id, games_played desc, games_won desc, opponent_deck_name);

create or replace function public.refresh_user_archetype_matchup_stats(
  target_user_id uuid,
  target_opponent_deck_slug text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_slug text := nullif(trim(coalesce(target_opponent_deck_slug, '')), '');
  next_games_played bigint;
  next_games_won bigint;
  next_games_lost bigint;
  next_opponent_deck_name text;
  next_opponent_deck_sprites text;
  next_last_played_date date;
begin
  if target_user_id is null or normalized_slug is null then
    return;
  end if;

  select
    count(*)::bigint,
    count(*) filter (where result = 'Win')::bigint,
    count(*) filter (where result = 'Loss')::bigint,
    coalesce((array_agg(opponent_deck_name order by date desc, imported_at desc, id desc))[1], '')::text,
    coalesce((array_agg(opponent_deck_sprites order by date desc, imported_at desc, id desc))[1], '')::text,
    max(date)
  into
    next_games_played,
    next_games_won,
    next_games_lost,
    next_opponent_deck_name,
    next_opponent_deck_sprites,
    next_last_played_date
  from public.logs
  where user_id = target_user_id
    and opponent_deck_slug = normalized_slug;

  if coalesce(next_games_played, 0) = 0 then
    delete from public.user_archetype_matchup_stats
    where user_id = target_user_id
      and opponent_deck_slug = normalized_slug;
    return;
  end if;

  insert into public.user_archetype_matchup_stats (
    user_id,
    opponent_deck_slug,
    opponent_deck_name,
    opponent_deck_sprites,
    games_played,
    games_won,
    games_lost,
    last_played_date
  )
  values (
    target_user_id,
    normalized_slug,
    next_opponent_deck_name,
    next_opponent_deck_sprites,
    next_games_played,
    coalesce(next_games_won, 0),
    coalesce(next_games_lost, 0),
    next_last_played_date
  )
  on conflict (user_id, opponent_deck_slug) do update
  set opponent_deck_name = excluded.opponent_deck_name,
      opponent_deck_sprites = excluded.opponent_deck_sprites,
      games_played = excluded.games_played,
      games_won = excluded.games_won,
      games_lost = excluded.games_lost,
      last_played_date = excluded.last_played_date,
      updated_at = now();
end;
$$;

create or replace function public.sync_user_archetype_matchup_stats_from_log_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_user_archetype_matchup_stats(old.user_id, old.opponent_deck_slug);
    return old;
  end if;

  perform public.refresh_user_archetype_matchup_stats(new.user_id, new.opponent_deck_slug);

  if tg_op = 'UPDATE' and (
    old.user_id is distinct from new.user_id or
    old.opponent_deck_slug is distinct from new.opponent_deck_slug
  ) then
    perform public.refresh_user_archetype_matchup_stats(old.user_id, old.opponent_deck_slug);
  end if;

  return new;
end;
$$;

revoke all on function public.refresh_user_archetype_matchup_stats(uuid, text) from public;
revoke all on function public.refresh_user_archetype_matchup_stats(uuid, text) from anon;
revoke all on function public.refresh_user_archetype_matchup_stats(uuid, text) from authenticated;
revoke all on function public.sync_user_archetype_matchup_stats_from_log_row() from public;
revoke all on function public.sync_user_archetype_matchup_stats_from_log_row() from anon;
revoke all on function public.sync_user_archetype_matchup_stats_from_log_row() from authenticated;

drop trigger if exists refresh_user_archetype_matchup_stats_after_insert on public.logs;
create trigger refresh_user_archetype_matchup_stats_after_insert
  after insert on public.logs
  for each row execute function public.sync_user_archetype_matchup_stats_from_log_row();

drop trigger if exists refresh_user_archetype_matchup_stats_after_delete on public.logs;
create trigger refresh_user_archetype_matchup_stats_after_delete
  after delete on public.logs
  for each row execute function public.sync_user_archetype_matchup_stats_from_log_row();

drop trigger if exists refresh_user_archetype_matchup_stats_after_matchup_update on public.logs;
create trigger refresh_user_archetype_matchup_stats_after_matchup_update
  after update of user_id, result, date, opponent_deck_slug, opponent_deck_name, opponent_deck_sprites
  on public.logs
  for each row execute function public.sync_user_archetype_matchup_stats_from_log_row();

insert into public.user_archetype_matchup_stats (
  user_id,
  opponent_deck_slug,
  opponent_deck_name,
  opponent_deck_sprites,
  games_played,
  games_won,
  games_lost,
  last_played_date
)
select
  user_id,
  opponent_deck_slug,
  coalesce((array_agg(opponent_deck_name order by date desc, imported_at desc, id desc))[1], '')::text as opponent_deck_name,
  coalesce((array_agg(opponent_deck_sprites order by date desc, imported_at desc, id desc))[1], '')::text as opponent_deck_sprites,
  count(*)::bigint as games_played,
  count(*) filter (where result = 'Win')::bigint as games_won,
  count(*) filter (where result = 'Loss')::bigint as games_lost,
  max(date) as last_played_date
from public.logs
where nullif(trim(opponent_deck_slug), '') is not null
group by user_id, opponent_deck_slug
on conflict (user_id, opponent_deck_slug) do update
set opponent_deck_name = excluded.opponent_deck_name,
    opponent_deck_sprites = excluded.opponent_deck_sprites,
    games_played = excluded.games_played,
    games_won = excluded.games_won,
    games_lost = excluded.games_lost,
    last_played_date = excluded.last_played_date,
    updated_at = now();

alter table public.user_archetype_matchup_stats enable row level security;

drop policy if exists "Users can read own archetype matchup stats" on public.user_archetype_matchup_stats;
create policy "Users can read own archetype matchup stats"
  on public.user_archetype_matchup_stats for select
  using (auth.uid() = user_id);

notify pgrst, 'reload schema';
