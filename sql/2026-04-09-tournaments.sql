-- ============================================================
-- Tournament feature migration
-- Run this in the Supabase SQL editor for the current project.
-- ============================================================

create table if not exists public.tournaments (
  id                text primary key,
  user_id           uuid not null references auth.users(id) on delete cascade,
  name              text not null default '',
  date_from         date not null,
  date_to           date not null,
  linked_deck_id    text references public.decks(id) on delete set null,
  deck_name         text not null default '',
  deck_sprites      jsonb not null default '[]',
  category          text not null default ''
                      check (category in ('', 'online', 'local', 'challenge', 'cup', 'regional', 'international', 'world')),
  placement         text not null default ''
                      check (placement in ('', 'no placement', 'dropped', 't1024', 't512', 't256', 't128', 't64', 't32', 't16', 't8', 't4', 'finalist', 'champion')),
  format            text not null default '',
  notes             text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint tournaments_valid_date_range
    check (date_to >= date_from)
);

comment on table public.tournaments is
  'User tournament records. Can link to a saved deck or store a manual deck snapshot.';

comment on column public.tournaments.deck_sprites is
  'Array of Pokemon slug strings used for tournament deck display.';


create table if not exists public.tournament_rounds (
  id                     text primary key,
  tournament_id          text not null references public.tournaments(id) on delete cascade,
  user_id                uuid not null references auth.users(id) on delete cascade,
  round_number           integer not null check (round_number > 0),
  opponent_deck_name     text not null default '',
  opponent_deck_sprites  jsonb not null default '[]',
  result                 text not null
                           check (result in ('Win', 'Loss', 'Tie')),
  notes                  text not null default '',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint tournament_rounds_unique_round
    unique (tournament_id, round_number)
);

comment on table public.tournament_rounds is
  'Round-by-round results for a tournament run.';

comment on column public.tournament_rounds.opponent_deck_sprites is
  'Array of Pokemon slug strings used for opponent deck display.';


create index if not exists tournaments_user_date
  on public.tournaments (user_id, date_from desc, date_to desc);

create index if not exists tournaments_linked_deck
  on public.tournaments (linked_deck_id)
  where linked_deck_id is not null;

create index if not exists tournament_rounds_tournament
  on public.tournament_rounds (tournament_id, round_number asc);

create index if not exists tournament_rounds_user
  on public.tournament_rounds (user_id, created_at desc);


create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_tournaments_updated_at on public.tournaments;
create trigger set_tournaments_updated_at
  before update on public.tournaments
  for each row execute function set_updated_at();

drop trigger if exists set_tournament_rounds_updated_at on public.tournament_rounds;
create trigger set_tournament_rounds_updated_at
  before update on public.tournament_rounds
  for each row execute function set_updated_at();


alter table public.tournaments enable row level security;
alter table public.tournament_rounds enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tournaments'
      and policyname = 'Users can read own tournaments'
  ) then
    create policy "Users can read own tournaments"
      on public.tournaments for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tournaments'
      and policyname = 'Users can insert own tournaments'
  ) then
    create policy "Users can insert own tournaments"
      on public.tournaments for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tournaments'
      and policyname = 'Users can update own tournaments'
  ) then
    create policy "Users can update own tournaments"
      on public.tournaments for update
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tournaments'
      and policyname = 'Users can delete own tournaments'
  ) then
    create policy "Users can delete own tournaments"
      on public.tournaments for delete
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tournament_rounds'
      and policyname = 'Users can read own tournament rounds'
  ) then
    create policy "Users can read own tournament rounds"
      on public.tournament_rounds for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tournament_rounds'
      and policyname = 'Users can insert own tournament rounds'
  ) then
    create policy "Users can insert own tournament rounds"
      on public.tournament_rounds for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tournament_rounds'
      and policyname = 'Users can update own tournament rounds'
  ) then
    create policy "Users can update own tournament rounds"
      on public.tournament_rounds for update
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tournament_rounds'
      and policyname = 'Users can delete own tournament rounds'
  ) then
    create policy "Users can delete own tournament rounds"
      on public.tournament_rounds for delete
      using (auth.uid() = user_id);
  end if;
end
$$;


update public.role_permissions
set
  menu_sections = '["logs", "decks", "tournaments", "stats", "calculator"]'::jsonb,
  updated_at = now()
where role in ('user', 'admin');


notify pgrst, 'reload schema';
