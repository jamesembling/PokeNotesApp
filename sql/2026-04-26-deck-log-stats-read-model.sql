-- Authoritative per-deck record read model for fast /decks rendering.
-- Updated from logs writes so page renders never aggregate linked logs live.

create table if not exists public.deck_log_stats (
  user_id      uuid not null references auth.users(id) on delete cascade,
  deck_id      text not null references public.decks(id) on delete cascade,
  games_played bigint not null default 0,
  games_won    bigint not null default 0,
  games_lost   bigint not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  primary key (user_id, deck_id)
);

comment on table public.deck_log_stats is
  'Per-deck linked-log rollup for the deck index. Updated whenever linked log records change.';

create or replace function public.refresh_deck_log_stats(
  target_user_id uuid,
  target_deck_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  next_games_played bigint;
  next_games_won bigint;
  next_games_lost bigint;
begin
  if target_user_id is null or nullif(target_deck_id, '') is null then
    return;
  end if;

  if not exists (
    select 1
    from public.decks d
    where d.id = target_deck_id
      and d.user_id = target_user_id
  ) then
    delete from public.deck_log_stats
    where user_id = target_user_id
      and deck_id = target_deck_id;
    return;
  end if;

  select
    count(*)::bigint,
    count(*) filter (where result = 'Win')::bigint,
    count(*) filter (where result = 'Loss')::bigint
  into next_games_played, next_games_won, next_games_lost
  from public.logs
  where user_id = target_user_id
    and linked_deck_id = target_deck_id;

  if coalesce(next_games_played, 0) = 0 then
    delete from public.deck_log_stats
    where user_id = target_user_id
      and deck_id = target_deck_id;
    return;
  end if;

  insert into public.deck_log_stats (
    user_id,
    deck_id,
    games_played,
    games_won,
    games_lost
  )
  values (
    target_user_id,
    target_deck_id,
    next_games_played,
    coalesce(next_games_won, 0),
    coalesce(next_games_lost, 0)
  )
  on conflict (user_id, deck_id) do update
  set games_played = excluded.games_played,
      games_won = excluded.games_won,
      games_lost = excluded.games_lost,
      updated_at = now();
end;
$$;

create or replace function public.sync_deck_log_stats_from_log_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_deck_log_stats(old.user_id, old.linked_deck_id);
    return old;
  end if;

  perform public.refresh_deck_log_stats(new.user_id, new.linked_deck_id);

  if tg_op = 'UPDATE' and (
    old.user_id is distinct from new.user_id or
    old.linked_deck_id is distinct from new.linked_deck_id
  ) then
    perform public.refresh_deck_log_stats(old.user_id, old.linked_deck_id);
  end if;

  return new;
end;
$$;

drop trigger if exists refresh_deck_log_stats_after_insert on public.logs;
create trigger refresh_deck_log_stats_after_insert
  after insert on public.logs
  for each row execute function public.sync_deck_log_stats_from_log_row();

drop trigger if exists refresh_deck_log_stats_after_delete on public.logs;
create trigger refresh_deck_log_stats_after_delete
  after delete on public.logs
  for each row execute function public.sync_deck_log_stats_from_log_row();

drop trigger if exists refresh_deck_log_stats_after_link_update on public.logs;
create trigger refresh_deck_log_stats_after_link_update
  after update of user_id, result, linked_deck_id on public.logs
  for each row execute function public.sync_deck_log_stats_from_log_row();

insert into public.deck_log_stats (
  user_id,
  deck_id,
  games_played,
  games_won,
  games_lost
)
select
  l.user_id,
  l.linked_deck_id,
  count(*)::bigint as games_played,
  count(*) filter (where l.result = 'Win')::bigint as games_won,
  count(*) filter (where l.result = 'Loss')::bigint as games_lost
from public.logs l
join public.decks d
  on d.id = l.linked_deck_id
 and d.user_id = l.user_id
where l.linked_deck_id is not null
group by l.user_id, l.linked_deck_id
on conflict (user_id, deck_id) do update
set games_played = excluded.games_played,
    games_won = excluded.games_won,
    games_lost = excluded.games_lost,
    updated_at = now();

alter table public.deck_log_stats enable row level security;

drop policy if exists "Users can read own deck log stats" on public.deck_log_stats;
create policy "Users can read own deck log stats"
  on public.deck_log_stats for select
  using (auth.uid() = user_id);

create or replace function public.get_deck_index_stats(target_deck_ids text[])
returns table (
  deck_id text,
  total bigint,
  wins bigint,
  losses bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    s.deck_id,
    s.games_played as total,
    s.games_won as wins,
    s.games_lost as losses
  from public.deck_log_stats s
  where s.user_id = auth.uid()
    and s.deck_id = any(target_deck_ids);
$$;

revoke all on function public.get_deck_index_stats(text[]) from public;
grant execute on function public.get_deck_index_stats(text[]) to authenticated;

notify pgrst, 'reload schema';
