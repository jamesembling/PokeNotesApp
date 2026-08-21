-- ============================================================
-- Poke Notes — Database Schema
-- ============================================================
-- Run this in your new Supabase project SQL editor.
-- Run on dev first, verify, then run on prod.
-- ============================================================

-- ============================================================
-- EXTENSIONS
-- ============================================================

create extension if not exists "pgcrypto";  -- for gen_random_uuid()


-- ============================================================
-- PROFILES
-- Extends auth.users with app-specific user data.
-- One row per user, created automatically on first sign-in.
-- ============================================================

create table public.profiles (
  id                      uuid primary key references auth.users(id) on delete cascade,
  display_name            text not null default '',
  first_name              text not null default '',
  last_name               text not null default '',
  email                   text not null default '',
  ptcgl_username          text not null default '',
  role                    text not null default 'user'
                            check (role in ('user', 'admin')),
  avatar_color            text not null default 'red',
  auth_account_created_at timestamptz,
  last_login_at           timestamptz,
  last_active_at          timestamptz,
  login_count             integer not null default 0,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.profiles is
  'App-specific user profile data. Extends auth.users.';
comment on column public.profiles.ptcgl_username is
  'The user''s Pokemon TCG Live username. Required for self-player identification during log import.';
comment on column public.profiles.role is
  'user = standard access, admin = full admin panel access.';


-- ============================================================
-- DECKS
-- A user's saved deck strategies.
-- ============================================================

create table public.decks (
  id                text primary key,
  user_id           uuid not null references auth.users(id) on delete cascade,

  -- Core identity
  deck_name         text not null default '',
  archetype_id      text not null default '',
  format            text not null default '',
  go_preference     text not null default ''
                      check (go_preference in ('First', 'Second', '')),

  -- Pokemon selection (stored as array of slug strings)
  deck_pokemon      jsonb not null default '[]',

  -- Strategy content
  core_strategy     text not null default '',
  general_notes     text not null default '',
  setup_goals       jsonb not null default '[]',
  resource_plan     text not null default '',
  matchups          jsonb not null default '[]',

  -- Deck lists (array of deck list objects, stored as JSONB
  -- because they are complex nested structures with card entries)
  deck_lists        jsonb not null default '[]',

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.decks is
  'User deck strategies. Each deck can have multiple deck lists and matchup plans.';
comment on column public.decks.archetype_id is
  'Backend-owned canonical deck archetype key derived from the selected Pokemon slugs.';
comment on column public.decks.matchups is
  'Array of matchup plan objects. Each has id, deckName, deckPokemon, and timestamps.';
comment on column public.decks.deck_lists is
  'Array of deck list objects. Each has id, name, format, rawList, and parsed card data.';


-- ============================================================
-- DECK LISTS
-- Relational deck-list rows, kept in compatibility with decks.deck_lists.
-- ============================================================

create table public.deck_lists (
  id                   text primary key,
  deck_id              text not null references public.decks(id) on delete cascade,
  user_id              uuid not null references auth.users(id) on delete cascade,
  name                 text not null default '',
  format               text not null default '',
  date                 text not null default '',
  created_by           text not null default '',
  notes                text not null default '',
  raw_list             text not null default '',
  parsed_cards         jsonb not null default '[]',
  sorted_cards         jsonb not null default '[]',
  sorted_cards_version integer,
  position             integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint deck_lists_user_deck_id_unique
    unique (user_id, deck_id, id)
);

comment on table public.deck_lists is
  'Relational deck-list rows. Kept in compatibility with public.decks.deck_lists during migration.';
comment on column public.deck_lists.position is
  'Display order migrated from the previous decks.deck_lists JSON array order.';


-- ============================================================
-- DECK MATCHUPS
-- Relational matchup-note rows, kept in compatibility with decks.matchups.
-- ============================================================

create table public.deck_matchups (
  id             text primary key,
  deck_id        text not null references public.decks(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  deck_name      text not null default '',
  deck_pokemon   jsonb not null default '[]',
  format         text not null default '',
  go_preference  text not null default ''
                   check (go_preference in ('First', 'Second', '')),
  matchup_favor  text not null default '',
  ideal_bench    text not null default '',
  techs_needed   text not null default '',
  matchup_plan   text not null default '',
  position       integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint deck_matchups_user_deck_id_unique
    unique (user_id, deck_id, id)
);

comment on table public.deck_matchups is
  'Relational deck matchup-note rows. Kept in compatibility with public.decks.matchups during migration.';


-- ============================================================
-- TOURNAMENTS
-- Tournament runs tied to a deck strategy or a manually tracked deck.
-- ============================================================

create table public.tournaments (
  id                text primary key,
  user_id           uuid not null references auth.users(id) on delete cascade,
  name              text not null default '',
  date_from         date not null,
  date_to           date not null,
  linked_deck_id    text references public.decks(id) on delete set null,
  linked_deck_list_id text,
  deck_name         text not null default '',
  deck_sprites      jsonb not null default '[]',
  category          text not null default ''
                      check (category in ('', 'online', 'local', 'challenge', 'cup', 'prerelease', 'regional', 'world')),
  placement         text not null default ''
                      check (placement in ('', 'no placement', 'dropped', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 't1024', 't512', 't256', 't128', 't64', 't32', 't16', 't8', 't4', 'finalist', 'champion')),
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
comment on column public.tournaments.linked_deck_list_id is
  'References a deck list within linked_deck_id. Not a foreign key as deck lists are stored in JSONB.';


-- ============================================================
-- TOURNAMENT ROUNDS
-- Individual rounds within a tournament run.
-- ============================================================

create table public.tournament_rounds (
  id                     text primary key,
  tournament_id          text not null references public.tournaments(id) on delete cascade,
  user_id                uuid not null references auth.users(id) on delete cascade,
  round_number           integer not null check (round_number > 0),
  opponent_deck_name     text not null default '',
  opponent_deck_sprites  jsonb not null default '[]',
  result                 text not null
                           check (
                             result in ('BYE', 'ID', 'NO SHOW') OR
                             result in ('Win', 'Loss', 'Tie') OR
                             result ~ '^[WLT]{1,3}$'
                           ),
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


-- ============================================================
-- LOGS
-- Battle logs imported from PTCGL.
-- All filterable/sortable fields are proper columns.
-- The sections JSONB column is write-once at import time.
-- ============================================================

create table public.logs (
  id                      text primary key,
  user_id                 uuid not null references auth.users(id) on delete cascade,

  -- Core result data — all used for filtering and stats
  date                    date not null,
  result                  text not null check (result in ('Win', 'Loss')),
  format                  text not null default '',
  go_order                text not null default ''
                            check (go_order in ('First', 'Second', '')),

  -- Self player (the importing user's side)
  self_player_name        text not null default '',
  self_deck_name          text not null default '',
  self_deck_slug          text not null default '',
  self_deck_sprites       text not null default '',  -- comma-separated slugs

  -- Opponent player
  opponent_player_name    text not null default '',
  opponent_deck_name      text not null default '',
  opponent_deck_slug      text not null default '',
  opponent_deck_sprites   text not null default '',  -- comma-separated slugs

  -- Game stats — stored at import time, never recomputed
  total_turns             integer not null default 0,
  coin_toss_won           boolean,                   -- null if not determinable
  self_prizes_taken       integer not null default 0,
  opponent_prizes_taken   integer not null default 0,
  self_attack_damage      integer not null default 0,
  opponent_attack_damage  integer not null default 0,
  self_mulligans          integer not null default 0,
  opponent_mulligans      integer not null default 0,

  -- Deck linking — both optional, can be null
  linked_deck_id          text references public.decks(id) on delete set null,
  linked_deck_list_id     text,                      -- references deck_lists.id within the deck

  -- Game end reason (e.g. 'Concede', 'Prizes', '')
  reason                  text not null default '',

  -- Raw and parsed log content — write-once at import
  raw_log                 text not null default '',
  sections                jsonb not null default '[]',

  -- Full text search vector — updated by trigger
  search_vector           tsvector,

  imported_at             timestamptz not null default now(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.logs is
  'Battle logs imported from PTCGL. All stats columns are populated at import and never recomputed.';
comment on column public.logs.sections is
  'Parsed turn-by-turn log sections. Write-once at import. Never updated after creation.';
comment on column public.logs.self_deck_sprites is
  'Comma-separated Pokemon slug strings for sprite display. E.g. "dragapult,dusknoir"';
comment on column public.logs.coin_toss_won is
  'Whether the self player won the opening coin toss. Null if not determinable from the log.';
comment on column public.logs.linked_deck_list_id is
  'References a deck list within linked_deck_id. Not a foreign key as deck lists are stored in JSONB.';

create table public.user_log_stats (
  user_id                  uuid primary key references auth.users(id) on delete cascade,
  games_played             bigint not null default 0,
  games_won                bigint not null default 0,
  games_lost               bigint not null default 0,
  attack_damage            bigint not null default 0,
  opponent_attack_damage   bigint not null default 0,
  coin_flips_won           bigint not null default 0,
  coin_flips_lost          bigint not null default 0,
  mulligans_taken          bigint not null default 0,
  prizes_taken             bigint not null default 0,
  tracked_damage           bigint not null default 0,
  tracked_prizes           bigint not null default 0,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on table public.user_log_stats is
  'Per-user rollup totals for the stats page. Updated whenever logs are inserted, deleted, or stat fields change.';

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

create table if not exists public.user_archetype_matchup_stats (
  user_id               uuid not null references auth.users(id) on delete cascade,
  matchup_key           text not null,
  opponent_deck_name    text not null default '',
  opponent_deck_sprites text not null default '',
  source_deck_slugs     text not null default '',
  games_played          bigint not null default 0,
  games_won             bigint not null default 0,
  games_lost            bigint not null default 0,
  last_played_date      date,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  primary key (user_id, matchup_key)
);

comment on table public.user_archetype_matchup_stats is
  'Per-user opponent archetype matchup rollup for the stats page. Grouped by visible archetype identity, not raw detector slug.';
comment on column public.user_archetype_matchup_stats.matchup_key is
  'Stable visible matchup key. Prefers opponent sprites, then display name, then raw slug.';
comment on column public.user_archetype_matchup_stats.source_deck_slugs is
  'Comma-separated raw opponent_deck_slug values that contributed to this visible matchup row.';

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

revoke all on function public.refresh_deck_log_stats(uuid, text) from public;
revoke all on function public.refresh_deck_log_stats(uuid, text) from anon;
revoke all on function public.refresh_deck_log_stats(uuid, text) from authenticated;
revoke all on function public.sync_deck_log_stats_from_log_row() from public;
revoke all on function public.sync_deck_log_stats_from_log_row() from anon;
revoke all on function public.sync_deck_log_stats_from_log_row() from authenticated;

create or replace function public.get_archetype_matchup_key(
  target_opponent_deck_slug text,
  target_opponent_deck_name text,
  target_opponent_deck_sprites text
)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(
    nullif(trim(coalesce(target_opponent_deck_sprites, '')), ''),
    nullif(trim(coalesce(target_opponent_deck_name, '')), ''),
    nullif(trim(coalesce(target_opponent_deck_slug, '')), '')
  );
$$;

create or replace function public.refresh_user_archetype_matchup_stats(
  target_user_id uuid,
  target_matchup_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_key text := nullif(trim(coalesce(target_matchup_key, '')), '');
  next_games_played bigint;
  next_games_won bigint;
  next_games_lost bigint;
  next_opponent_deck_name text;
  next_opponent_deck_sprites text;
  next_source_deck_slugs text;
  next_last_played_date date;
begin
  if target_user_id is null or normalized_key is null then
    return;
  end if;

  select
    count(*)::bigint,
    count(*) filter (where result = 'Win')::bigint,
    count(*) filter (where result = 'Loss')::bigint,
    coalesce((array_agg(opponent_deck_name order by date desc, imported_at desc, id desc))[1], '')::text,
    coalesce((array_agg(opponent_deck_sprites order by date desc, imported_at desc, id desc))[1], '')::text,
    coalesce(string_agg(distinct nullif(trim(opponent_deck_slug), ''), ',' order by nullif(trim(opponent_deck_slug), '')), '')::text,
    max(date)
  into
    next_games_played,
    next_games_won,
    next_games_lost,
    next_opponent_deck_name,
    next_opponent_deck_sprites,
    next_source_deck_slugs,
    next_last_played_date
  from public.logs
  where user_id = target_user_id
    and public.get_archetype_matchup_key(
      opponent_deck_slug,
      opponent_deck_name,
      opponent_deck_sprites
    ) = normalized_key;

  if coalesce(next_games_played, 0) = 0 then
    delete from public.user_archetype_matchup_stats
    where user_id = target_user_id
      and matchup_key = normalized_key;
    return;
  end if;

  insert into public.user_archetype_matchup_stats (
    user_id,
    matchup_key,
    opponent_deck_name,
    opponent_deck_sprites,
    source_deck_slugs,
    games_played,
    games_won,
    games_lost,
    last_played_date
  )
  values (
    target_user_id,
    normalized_key,
    next_opponent_deck_name,
    next_opponent_deck_sprites,
    next_source_deck_slugs,
    next_games_played,
    coalesce(next_games_won, 0),
    coalesce(next_games_lost, 0),
    next_last_played_date
  )
  on conflict (user_id, matchup_key) do update
  set opponent_deck_name = excluded.opponent_deck_name,
      opponent_deck_sprites = excluded.opponent_deck_sprites,
      source_deck_slugs = excluded.source_deck_slugs,
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
    perform public.refresh_user_archetype_matchup_stats(
      old.user_id,
      public.get_archetype_matchup_key(old.opponent_deck_slug, old.opponent_deck_name, old.opponent_deck_sprites)
    );
    return old;
  end if;

  perform public.refresh_user_archetype_matchup_stats(
    new.user_id,
    public.get_archetype_matchup_key(new.opponent_deck_slug, new.opponent_deck_name, new.opponent_deck_sprites)
  );

  if tg_op = 'UPDATE' and (
    old.user_id is distinct from new.user_id or
    public.get_archetype_matchup_key(old.opponent_deck_slug, old.opponent_deck_name, old.opponent_deck_sprites)
      is distinct from public.get_archetype_matchup_key(new.opponent_deck_slug, new.opponent_deck_name, new.opponent_deck_sprites)
  ) then
    perform public.refresh_user_archetype_matchup_stats(
      old.user_id,
      public.get_archetype_matchup_key(old.opponent_deck_slug, old.opponent_deck_name, old.opponent_deck_sprites)
    );
  end if;

  return new;
end;
$$;

revoke all on function public.get_archetype_matchup_key(text, text, text) from public;
revoke all on function public.get_archetype_matchup_key(text, text, text) from anon;
revoke all on function public.get_archetype_matchup_key(text, text, text) from authenticated;
revoke all on function public.refresh_user_archetype_matchup_stats(uuid, text) from public;
revoke all on function public.refresh_user_archetype_matchup_stats(uuid, text) from anon;
revoke all on function public.refresh_user_archetype_matchup_stats(uuid, text) from authenticated;
revoke all on function public.sync_user_archetype_matchup_stats_from_log_row() from public;
revoke all on function public.sync_user_archetype_matchup_stats_from_log_row() from anon;
revoke all on function public.sync_user_archetype_matchup_stats_from_log_row() from authenticated;

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


create or replace function public.get_log_stats_overview()
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

create or replace function public.get_admin_dashboard_overview()
returns table (
  user_count bigint,
  admin_count bigint,
  pokemon_catalog_count bigint,
  archetype_catalog_count bigint,
  excluded_archetype_count bigint,
  pokemon_last_synced_at timestamptz,
  archetype_last_synced_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  select
    (select count(*) from public.profiles)::bigint as user_count,
    (select count(*) from public.profiles where role = 'admin')::bigint as admin_count,
    (select count(*) from public.pokemon_catalog)::bigint as pokemon_catalog_count,
    (select count(*) from public.archetype_catalog)::bigint as archetype_catalog_count,
    (select count(*) from public.archetype_catalog where is_excluded = true)::bigint as excluded_archetype_count,
    (select max(last_synced_at) from public.pokemon_catalog) as pokemon_last_synced_at,
    (select max(last_synced_at) from public.archetype_catalog) as archetype_last_synced_at;
end;
$$;

create or replace function public.get_admin_users_overview()
returns table (
  id uuid,
  email text,
  display_name text,
  ptcgl_username text,
  role text,
  auth_account_created_at timestamptz,
  last_login_at timestamptz,
  last_active_at timestamptz,
  last_activity_at timestamptz,
  login_count integer,
  created_at timestamptz,
  deck_count integer,
  deck_list_count integer,
  tournament_count integer,
  log_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  with current_profile as (
    select role
    from public.profiles
    where id = auth.uid()
    limit 1
  ),
  deck_counts as (
    select
      user_id,
      count(*)::integer as deck_count,
      coalesce(
        sum(
          case
            when jsonb_typeof(deck_lists) = 'array' then jsonb_array_length(deck_lists)
            else 0
          end
        ),
        0
      )::integer as deck_list_count,
      max(updated_at) as latest_deck_activity_at
    from public.decks
    group by user_id
  ),
  deck_list_counts as (
    select
      user_id,
      count(*)::integer as relational_deck_list_count,
      max(updated_at) as latest_deck_list_activity_at
    from public.deck_lists
    group by user_id
  ),
  tournament_counts as (
    select
      user_id,
      count(*)::integer as tournament_count,
      max(updated_at) as latest_tournament_activity_at
    from public.tournaments
    group by user_id
  ),
  log_activity as (
    select
      user_id,
      max(imported_at) as latest_log_activity_at
    from public.logs
    group by user_id
  ),
  activity_events as (
    select id as user_id, last_active_at as activity_at
    from public.profiles
    where last_active_at is not null

    union all

    select id as user_id, last_login_at as activity_at
    from public.profiles
    where last_login_at is not null

    union all

    select id as user_id, auth_account_created_at as activity_at
    from public.profiles
    where auth_account_created_at is not null

    union all

    select user_id, latest_deck_activity_at as activity_at
    from deck_counts
    where latest_deck_activity_at is not null

    union all

    select user_id, latest_deck_list_activity_at as activity_at
    from deck_list_counts
    where latest_deck_list_activity_at is not null

    union all

    select user_id, latest_tournament_activity_at as activity_at
    from tournament_counts
    where latest_tournament_activity_at is not null

    union all

    select user_id, latest_log_activity_at as activity_at
    from log_activity
    where latest_log_activity_at is not null
  ),
  user_activity as (
    select user_id, max(activity_at) as last_activity_at
    from activity_events
    group by user_id
  )
  select
    p.id,
    p.email,
    p.display_name,
    p.ptcgl_username,
    p.role,
    p.auth_account_created_at,
    p.last_login_at,
    p.last_active_at,
    coalesce(ua.last_activity_at, p.created_at) as last_activity_at,
    p.login_count,
    p.created_at,
    coalesce(dc.deck_count, 0) as deck_count,
    greatest(coalesce(dc.deck_list_count, 0), coalesce(dlc.relational_deck_list_count, 0)) as deck_list_count,
    coalesce(tc.tournament_count, 0) as tournament_count,
    coalesce(uls.games_played, 0)::integer as log_count
  from public.profiles p
  left join deck_counts dc on dc.user_id = p.id
  left join deck_list_counts dlc on dlc.user_id = p.id
  left join tournament_counts tc on tc.user_id = p.id
  left join public.user_log_stats uls on uls.user_id = p.id
  left join user_activity ua on ua.user_id = p.id
  where exists (select 1 from current_profile where role = 'admin')
  order by
    case when p.role = 'admin' then 0 else 1 end,
    coalesce(ua.last_activity_at, p.last_active_at, p.last_login_at, p.auth_account_created_at, p.created_at) desc;
$$;

create or replace function public.get_deck_index()
returns table (
  id text,
  user_id uuid,
  deck_name text,
  archetype_id text,
  format text,
  go_preference text,
  deck_pokemon jsonb,
  deck_list_count integer,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    d.id,
    d.user_id,
    d.deck_name,
    d.archetype_id,
    d.format,
    d.go_preference,
    d.deck_pokemon,
    greatest(
      (
        select count(*)::integer
        from public.deck_lists dl
        where dl.user_id = d.user_id
          and dl.deck_id = d.id
      ),
      case
        when jsonb_typeof(d.deck_lists) = 'array' then jsonb_array_length(d.deck_lists)
        else 0
      end
    ) as deck_list_count,
    d.created_at,
    d.updated_at
  from public.decks d
  where d.user_id = auth.uid()
  order by d.updated_at desc;
$$;

create or replace function public.get_deck_index_page_data()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with request_context as (
    select (select auth.uid()) as user_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', decks.id,
        'user_id', decks.user_id,
        'deck_name', decks.deck_name,
        'archetype_id', decks.archetype_id,
        'format', decks.format,
        'go_preference', decks.go_preference,
        'deck_pokemon', decks.deck_pokemon,
        'deck_list_count', greatest(
          (
            select count(*)::integer
            from public.deck_lists
            where deck_lists.user_id = decks.user_id
              and deck_lists.deck_id = decks.id
          ),
          case
            when jsonb_typeof(decks.deck_lists) = 'array' then jsonb_array_length(decks.deck_lists)
            else 0
          end
        ),
        'games_played', coalesce(deck_log_stats.games_played, 0),
        'games_won', coalesce(deck_log_stats.games_won, 0),
        'games_lost', coalesce(deck_log_stats.games_lost, 0),
        'created_at', decks.created_at,
        'updated_at', decks.updated_at
      )
      order by decks.updated_at desc
    ),
    '[]'::jsonb
  )
  from public.decks
  cross join request_context
  left join public.deck_log_stats
    on deck_log_stats.user_id = request_context.user_id
    and deck_log_stats.deck_id = decks.id
  where decks.user_id = request_context.user_id;
$$;

revoke execute on function public.get_deck_index_page_data() from public, anon;
grant execute on function public.get_deck_index_page_data() to authenticated;

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

revoke all on function public.get_admin_dashboard_overview() from public;
grant execute on function public.get_admin_dashboard_overview() to authenticated;
revoke all on function public.get_deck_index_stats(text[]) from public;
grant execute on function public.get_deck_index_stats(text[]) to authenticated;


-- ============================================================
-- LOG SHARES
-- Snapshot shares of battle logs for public viewing.
-- Snapshots are immutable — changes to the original log
-- do not affect existing shares.
-- ============================================================

create table public.log_shares (
  id                text primary key,       -- cryptographically random URL-safe token
  owner_user_id     uuid not null references auth.users(id) on delete cascade,
  source_log_id     text,

  -- Full snapshot of the log at time of sharing
  -- Includes all log fields plus resolved deck list if linked
  payload           jsonb not null,
  expires_at        timestamptz not null default (now() + interval '30 days'),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.log_shares is
  'Public share tokens for battle logs. Payload is a full snapshot taken at share time.';
comment on column public.log_shares.id is
  'Share token. Must be cryptographically random and never sequential.';
comment on column public.log_shares.source_log_id is
  'Source battle log ID for owner-side share management. Nullable for legacy rows created before this column existed.';
comment on column public.log_shares.payload is
  'Complete snapshot of the log including all fields and resolved deck list. Immutable after creation.';


-- ============================================================
-- POKEMON CATALOG
-- Master list of all Pokemon with slugs, stages, evolution
-- chains, and localised names.
-- Populated and refreshed by the catalog sync cron job.
-- Replaces the bundled pokedex-catalog.js and pokemon-stages.js files.
-- ============================================================

create table public.pokemon_catalog (
  slug              text primary key,        -- e.g. "dragapult", "dialga-origin"
  label             text not null,           -- e.g. "Dragapult", "Origin Forme Dialga"
  national_dex      integer,
  stage             text not null default 'Basic'
                      check (stage in ('Basic', 'Stage 1', 'Stage 2')),
  evolves_from      text references public.pokemon_catalog(slug) on delete set null,
  sprite_url        text not null default '',

  -- Localised names for non-English log identification
  name_de           text,
  name_es           text,
  name_fr           text,
  name_it           text,
  name_pt_br        text,

  last_synced_at    timestamptz not null default now()
);

comment on table public.pokemon_catalog is
  'Master Pokemon catalog. Refreshed daily from PokéAPI and Limitless. Replaces bundled JS files.';
comment on column public.pokemon_catalog.evolves_from is
  'Slug of the pre-evolution. Used by archetype identification to match pre-evolutions as evidence of their final form.';
comment on column public.pokemon_catalog.stage is
  'TCG stage classification. Basic = no evolution required. Stage 1 = evolves from Basic. Stage 2 = evolves from Stage 1.';


-- ============================================================
-- CARD EFFECT CATALOG
-- Structured Pokemon TCG card effects used to classify battle
-- log rows without live card lookups.
-- ============================================================

create table public.card_effect_catalog (
  source_card_id          text not null,
  card_name               text not null,
  normalized_card_name    text not null,
  supertype               text not null default '',
  subtypes                jsonb not null default '[]',
  effect_kind             text not null
                            check (effect_kind in ('ability', 'attack', 'supporter', 'item', 'tool', 'stadium')),
  effect_name             text,
  normalized_effect_name  text not null default '',
  effect_text             text,
  last_synced_at          timestamptz not null default now(),

  primary key (source_card_id, effect_kind, normalized_effect_name)
);

comment on table public.card_effect_catalog is
  'Structured Pokemon TCG card effects used to classify battle-log actions without live card lookups.';
comment on column public.card_effect_catalog.source_card_id is
  'Pokemon TCG API card id for the printed card version.';
comment on column public.card_effect_catalog.effect_kind is
  'Battle-log classification derived from card data. Pokemon effects are ability or attack; trainer cards are supporter, item, tool, or stadium.';


-- ============================================================
-- ARCHETYPE CATALOG
-- Known competitive deck archetypes sourced from Limitless TCG.
-- Used for automatic deck identification during log import.
-- Replaces the bundled battle-log-archetypes.js file.
-- ============================================================

create table public.archetype_catalog (
  id                text primary key,        -- e.g. "dragapult-ex", "charizard-ex"
  canonical_id      text,                    -- stable archetype key for learned rows
  label             text not null,           -- e.g. "Dragapult ex", "Charizard ex"

  -- Curated Pokemon slug strings that represent this archetype in the UI
  -- e.g. ["dragapult", "dusknoir"]
  sprites           jsonb not null default '[]',

  -- Additional Pokemon slug strings that should count as evidence during import
  -- e.g. ["dragapult", "dusknoir", "drakloak", "dreepy"]
  detection_sprites jsonb not null default '[]',

  -- Optional grouped evidence requirements. Each inner array is an OR group,
  -- and every group must have at least one Pokemon match for this archetype
  -- to qualify during identification.
  required_match_groups jsonb not null default '[]',

  -- Archetypes that cause false positive matches are excluded
  -- See known-edge-cases.md section 1.1
  is_excluded       boolean not null default false,
  source            text not null default 'curated' check (source in ('curated', 'learned')),
  user_id           uuid references auth.users(id) on delete cascade,
  learned_match_count integer not null default 0 check (learned_match_count >= 0),

  last_synced_at    timestamptz not null default now(),
  constraint archetype_catalog_learned_owner_check check (
    (source = 'curated' and user_id is null)
    or (source = 'learned' and user_id is not null and canonical_id is not null)
  )
);

comment on table public.archetype_catalog is
  'Curated and user-learned deck archetypes used for battle log identification.';
comment on column public.archetype_catalog.is_excluded is
  'When true, this archetype is skipped during log identification. See known-edge-cases.md 1.1.';
comment on column public.archetype_catalog.sprites is
  'Curated Pokemon slugs that visually represent this archetype in the UI.';
comment on column public.archetype_catalog.detection_sprites is
  'Additional Pokemon slugs that should count as evidence when identifying this archetype from a battle log.';
comment on column public.archetype_catalog.required_match_groups is
  'Optional grouped evidence requirements. Each group needs at least one matching Pokemon before the archetype can qualify.';
comment on column public.archetype_catalog.canonical_id is
  'Stable archetype key returned by import identification. Learned rows use a user-scoped primary key and store the sprite archetype key here.';
comment on column public.archetype_catalog.source is
  'curated rows are global catalog entries; learned rows are user-scoped entries promoted from repeated imported self-deck sprites.';
comment on column public.archetype_catalog.user_id is
  'Owner for learned archetype rows. Null for curated global rows.';
comment on column public.archetype_catalog.learned_match_count is
  'Number of matching self-deck logs observed when the learned archetype row was promoted or refreshed.';


-- ============================================================
-- ROLE PERMISSIONS
-- Controls which menu sections are visible per role.
-- ============================================================

create table public.role_permissions (
  role              text primary key check (role in ('user', 'admin')),
  menu_sections     jsonb not null default '[]',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.role_permissions is
  'Menu section visibility configuration per role.';


-- ============================================================
-- ROUTE PERFORMANCE EVENTS
-- Real-user route timing events for production performance diagnosis.
-- ============================================================

create table public.route_performance_events (
  browser_family          text not null default 'unknown'
                          check (browser_family in ('chromium', 'firefox', 'other', 'safari', 'unknown')),
  created_at              timestamptz not null default now(),
  deployment_env          text not null default 'unknown',
  deployment_id           text,
  device_class            text not null default 'unknown'
                          check (device_class in ('desktop', 'mobile', 'tablet', 'unknown')),
  device_memory           numeric,
  document_download_ms    integer,
  dom_content_loaded_ms   integer,
  downlink                numeric,
  duration_ms             integer not null,
  effective_type          text,
  event_type              text not null check (event_type in ('hard-load', 'app-route')),
  from_path               text,
  hardware_concurrency    integer,
  id                      uuid primary key default gen_random_uuid(),
  load_event_ms           integer,
  loading_ms              integer,
  max_long_task_ms        integer,
  navigation_type         text not null default 'unknown'
                          check (navigation_type in ('app-route', 'back_forward', 'navigate', 'prerender', 'reload', 'unknown')),
  reporter_version        smallint not null default 1 check (reporter_version > 0),
  resource_count          integer,
  response_end_ms         integer,
  route_stabilization_ms  integer,
  rtt                     integer,
  save_data               boolean not null default false,
  screen_height           integer,
  screen_width            integer,
  server_auth_ms          integer,
  server_route_data_ms    integer,
  server_shell_profile_ms integer,
  slowest_resource_ms     integer,
  slowest_resource_path   text,
  source_host             text,
  source_origin           text,
  to_path                 text not null,
  total_blocking_time_ms  integer,
  traffic_class           text not null default 'unclassified'
                          check (traffic_class in ('automation', 'unclassified')),
  transfer_size_bytes     integer,
  ttfb_ms                 integer,
  user_agent              text,
  user_id                 uuid not null references auth.users(id) on delete cascade,
  viewport_height         integer,
  viewport_width          integer,
  visibility_state        text not null default 'unknown'
                          check (visibility_state in ('hidden', 'prerender', 'unknown', 'visible'))
);

comment on table public.route_performance_events is
  'Real-user route timing events captured from authenticated app sessions.';


-- ============================================================
-- DATA API GRANTS
-- Required for Supabase projects where public-schema tables are
-- not exposed to PostgREST/GraphQL by default.
-- RLS policies below still decide which rows each role can access.
-- ============================================================

grant usage on schema public to anon, authenticated, service_role;

revoke all privileges on all tables in schema public from anon, authenticated, service_role;

grant select, insert, update on table public.profiles to authenticated;
grant all privileges on table public.profiles to service_role;

grant select, insert, update, delete on table public.decks to authenticated;
grant all privileges on table public.decks to service_role;

grant select, insert, update, delete on table public.deck_lists to authenticated;
grant all privileges on table public.deck_lists to service_role;

grant select, insert, update, delete on table public.deck_matchups to authenticated;
grant all privileges on table public.deck_matchups to service_role;

grant select, insert, update, delete on table public.tournaments to authenticated;
grant all privileges on table public.tournaments to service_role;

grant select, insert, update, delete on table public.tournament_rounds to authenticated;
grant all privileges on table public.tournament_rounds to service_role;

grant select, insert, update, delete on table public.logs to authenticated;
grant all privileges on table public.logs to service_role;

grant select on table public.user_log_stats to authenticated;
grant all privileges on table public.user_log_stats to service_role;

grant select on table public.deck_log_stats to authenticated;
grant all privileges on table public.deck_log_stats to service_role;

grant select on table public.user_archetype_matchup_stats to authenticated;
grant all privileges on table public.user_archetype_matchup_stats to service_role;

grant select on table public.log_shares to anon;
grant select, insert, delete on table public.log_shares to authenticated;
grant all privileges on table public.log_shares to service_role;

grant select on table public.pokemon_catalog to anon, authenticated;
grant all privileges on table public.pokemon_catalog to service_role;

grant select on table public.card_effect_catalog to anon, authenticated;
grant all privileges on table public.card_effect_catalog to service_role;

grant select on table public.archetype_catalog to anon, authenticated;
grant insert, update on table public.archetype_catalog to authenticated;
grant all privileges on table public.archetype_catalog to service_role;

grant select on table public.role_permissions to anon, authenticated;
grant update on table public.role_permissions to authenticated;
grant all privileges on table public.role_permissions to service_role;

grant select, insert on table public.route_performance_events to authenticated;
grant all privileges on table public.route_performance_events to service_role;


-- ============================================================
-- INDEXES
-- Added for every column used in filtering, sorting, or joins.
-- ============================================================

-- Logs: primary query patterns
create index logs_user_date
  on public.logs (user_id, date desc);

create index logs_user_date_imported_id
  on public.logs (user_id, date desc, imported_at desc, id desc);

create index logs_user_result
  on public.logs (user_id, result);

create index logs_user_format
  on public.logs (user_id, format);

create index logs_user_opponent_deck
  on public.logs (user_id, opponent_deck_slug);

create index logs_user_self_deck_sprites
  on public.logs (user_id, self_deck_sprites)
  where nullif(trim(self_deck_sprites), '') is not null;

create index logs_user_go_order
  on public.logs (user_id, go_order);

create index user_archetype_matchup_stats_user_sort
  on public.user_archetype_matchup_stats (user_id, games_played desc, games_won desc, opponent_deck_name);

create index logs_user_linked_deck_date
  on public.logs (user_id, linked_deck_id, date desc, imported_at desc)
  where linked_deck_id is not null;

create index logs_imported_at
  on public.logs (user_id, imported_at desc);

create index logs_user_unlinked_imported_at
  on public.logs (user_id, imported_at desc, id)
  where linked_deck_id is null;

-- Full text search
create index logs_search_vector
  on public.logs using gin(search_vector);

-- Decks
create index decks_user_id
  on public.decks (user_id);

create index decks_user_format
  on public.decks (user_id, format);

create index decks_user_archetype
  on public.decks (user_id, archetype_id)
  where archetype_id <> '';

create index deck_lists_user_deck_position
  on public.deck_lists (user_id, deck_id, position, created_at desc);

create index deck_lists_user_deck_updated
  on public.deck_lists (user_id, deck_id, updated_at desc);

create index deck_matchups_user_deck_position
  on public.deck_matchups (user_id, deck_id, position, created_at asc);

create index deck_matchups_user_deck_updated
  on public.deck_matchups (user_id, deck_id, updated_at desc);

-- Tournaments
create index tournaments_user_date
  on public.tournaments (user_id, date_from desc, date_to desc);

create index tournaments_linked_deck
  on public.tournaments (linked_deck_id)
  where linked_deck_id is not null;

create index tournament_rounds_tournament
  on public.tournament_rounds (tournament_id, round_number asc);

create index tournament_rounds_user
  on public.tournament_rounds (user_id, created_at desc);

-- Pokemon catalog
create index pokemon_catalog_national_dex
  on public.pokemon_catalog (national_dex);

create index pokemon_catalog_evolves_from
  on public.pokemon_catalog (evolves_from)
  where evolves_from is not null;

-- Card effect catalog
create index card_effect_catalog_card_effect
  on public.card_effect_catalog (normalized_card_name, normalized_effect_name, effect_kind);

create index card_effect_catalog_card_kind
  on public.card_effect_catalog (normalized_card_name, effect_kind);

-- Archetype catalog
create index archetype_catalog_excluded
  on public.archetype_catalog (is_excluded)
  where is_excluded = false;

create index archetype_catalog_user_learned
  on public.archetype_catalog (user_id, canonical_id)
  where source = 'learned';

-- Log shares
create index log_shares_owner
  on public.log_shares (owner_user_id);
create index log_shares_owner_source_log
  on public.log_shares (owner_user_id, source_log_id);

-- Route performance events
create index route_performance_events_created_at
  on public.route_performance_events (created_at desc);

create index route_performance_events_user_created_at
  on public.route_performance_events (user_id, created_at desc);

create index route_performance_events_route_created_at
  on public.route_performance_events (to_path, created_at desc);

create index route_performance_events_env_route_created_at
  on public.route_performance_events (deployment_env, to_path, created_at desc);

create index route_performance_events_env_traffic_route_created_at
  on public.route_performance_events (deployment_env, traffic_class, to_path, created_at desc);


-- ============================================================
-- FULL TEXT SEARCH TRIGGER
-- Keeps search_vector updated on insert and update.
-- Indexes: self deck name, opponent deck name, format,
-- result, and raw log content (truncated for performance).
-- ============================================================

create or replace function update_log_search_vector()
returns trigger as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english',
      coalesce(new.self_deck_name, '')
    ), 'A') ||
    setweight(to_tsvector('english',
      coalesce(new.opponent_deck_name, '')
    ), 'A') ||
    setweight(to_tsvector('english',
      coalesce(new.format, '') || ' ' ||
      coalesce(new.result, '') || ' ' ||
      coalesce(new.self_player_name, '') || ' ' ||
      coalesce(new.opponent_player_name, '')
    ), 'B') ||
    setweight(to_tsvector('english',
      left(coalesce(new.raw_log, ''), 50000)
    ), 'C');
  return new;
end;
$$ language plpgsql;

create trigger log_search_vector_update
  before insert or update on public.logs
  for each row execute function update_log_search_vector();


-- ============================================================
-- UPDATED_AT TRIGGER
-- Automatically sets updated_at on every update.
-- ============================================================

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace function public.sync_user_log_stats_from_log_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_user_log_stats(old.user_id);
    return old;
  end if;

  perform public.refresh_user_log_stats(new.user_id);

  if tg_op = 'UPDATE' and old.user_id is distinct from new.user_id then
    perform public.refresh_user_log_stats(old.user_id);
  end if;

  return new;
end;
$$;

revoke all on function public.refresh_user_log_stats(uuid) from public;
revoke all on function public.refresh_user_log_stats(uuid) from anon;
revoke all on function public.refresh_user_log_stats(uuid) from authenticated;
revoke all on function public.sync_user_log_stats_from_log_row() from public;
revoke all on function public.sync_user_log_stats_from_log_row() from anon;
revoke all on function public.sync_user_log_stats_from_log_row() from authenticated;

create trigger set_logs_updated_at
  before update on public.logs
  for each row execute function set_updated_at();

create trigger set_decks_updated_at
  before update on public.decks
  for each row execute function set_updated_at();

create trigger set_deck_lists_updated_at
  before update on public.deck_lists
  for each row execute function set_updated_at();

create trigger set_deck_matchups_updated_at
  before update on public.deck_matchups
  for each row execute function set_updated_at();

create trigger set_tournaments_updated_at
  before update on public.tournaments
  for each row execute function set_updated_at();

create trigger set_tournament_rounds_updated_at
  before update on public.tournament_rounds
  for each row execute function set_updated_at();

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function set_updated_at();

create trigger set_log_shares_updated_at
  before update on public.log_shares
  for each row execute function set_updated_at();

create trigger set_user_archetype_matchup_stats_updated_at
  before update on public.user_archetype_matchup_stats
  for each row execute function set_updated_at();

create trigger refresh_user_log_stats_after_insert
  after insert on public.logs
  for each row execute function public.sync_user_log_stats_from_log_row();

create trigger refresh_user_log_stats_after_delete
  after delete on public.logs
  for each row execute function public.sync_user_log_stats_from_log_row();

create trigger refresh_user_log_stats_after_stats_update
  after update of user_id, result, raw_log, self_player_name, opponent_player_name,
    self_prizes_taken, opponent_prizes_taken, self_attack_damage,
    opponent_attack_damage, self_mulligans
  on public.logs
  for each row execute function public.sync_user_log_stats_from_log_row();


-- ============================================================
-- ROW LEVEL SECURITY
-- Every table has RLS enabled and explicit policies.
-- Test these before writing any app code.
-- ============================================================

-- PROFILES
alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Admins can read all profiles (for admin panel)
create policy "Admins can read all profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );


-- LOGS
alter table public.logs enable row level security;

create policy "Users can read own logs"
  on public.logs for select
  using (auth.uid() = user_id);

alter table public.user_archetype_matchup_stats enable row level security;

create policy "Users can read own archetype matchup stats"
  on public.user_archetype_matchup_stats for select
  using (auth.uid() = user_id);

create policy "Users can insert own logs"
  on public.logs for insert
  with check (auth.uid() = user_id);

create policy "Users can update own logs"
  on public.logs for update
  using (auth.uid() = user_id);

create policy "Users can delete own logs"
  on public.logs for delete
  using (auth.uid() = user_id);

alter table public.user_log_stats enable row level security;

create policy "Users can read own log stats"
  on public.user_log_stats for select
  using (auth.uid() = user_id);

alter table public.deck_log_stats enable row level security;

create policy "Users can read own deck log stats"
  on public.deck_log_stats for select
  using (auth.uid() = user_id);


-- DECKS
alter table public.decks enable row level security;

create policy "Users can read own decks"
  on public.decks for select
  using (auth.uid() = user_id);

create policy "Users can insert own decks"
  on public.decks for insert
  with check (auth.uid() = user_id);

create policy "Users can update own decks"
  on public.decks for update
  using (auth.uid() = user_id);

create policy "Users can delete own decks"
  on public.decks for delete
  using (auth.uid() = user_id);


-- DECK LISTS
alter table public.deck_lists enable row level security;

create policy "Users can read own deck lists"
  on public.deck_lists for select
  using (auth.uid() = user_id);

create policy "Users can insert own deck lists"
  on public.deck_lists for insert
  with check (auth.uid() = user_id);

create policy "Users can update own deck lists"
  on public.deck_lists for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own deck lists"
  on public.deck_lists for delete
  using (auth.uid() = user_id);


-- DECK MATCHUPS
alter table public.deck_matchups enable row level security;

create policy "Users can read own deck matchups"
  on public.deck_matchups for select
  using (auth.uid() = user_id);

create policy "Users can insert own deck matchups"
  on public.deck_matchups for insert
  with check (auth.uid() = user_id);

create policy "Users can update own deck matchups"
  on public.deck_matchups for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own deck matchups"
  on public.deck_matchups for delete
  using (auth.uid() = user_id);


-- TOURNAMENTS
alter table public.tournaments enable row level security;

create policy "Users can read own tournaments"
  on public.tournaments for select
  using (auth.uid() = user_id);

create policy "Users can insert own tournaments"
  on public.tournaments for insert
  with check (auth.uid() = user_id);

create policy "Users can update own tournaments"
  on public.tournaments for update
  using (auth.uid() = user_id);

create policy "Users can delete own tournaments"
  on public.tournaments for delete
  using (auth.uid() = user_id);


-- TOURNAMENT ROUNDS
alter table public.tournament_rounds enable row level security;

create policy "Users can read own tournament rounds"
  on public.tournament_rounds for select
  using (auth.uid() = user_id);

create policy "Users can insert own tournament rounds"
  on public.tournament_rounds for insert
  with check (auth.uid() = user_id);

create policy "Users can update own tournament rounds"
  on public.tournament_rounds for update
  using (auth.uid() = user_id);

create policy "Users can delete own tournament rounds"
  on public.tournament_rounds for delete
  using (auth.uid() = user_id);


-- LOG SHARES
-- Public read by token. Only owner can create or delete.
alter table public.log_shares enable row level security;

create policy "Anyone can read log shares"
  on public.log_shares for select
  using (true);

create policy "Owners can create log shares"
  on public.log_shares for insert
  with check (auth.uid() = owner_user_id);

create policy "Owners can delete log shares"
  on public.log_shares for delete
  using (auth.uid() = owner_user_id);


-- POKEMON CATALOG
-- Public read. Only service role can write (via cron).
alter table public.pokemon_catalog enable row level security;

create policy "Anyone can read pokemon catalog"
  on public.pokemon_catalog for select
  using (true);


-- CARD EFFECT CATALOG
-- Public read. Only service role can write (via cron).
alter table public.card_effect_catalog enable row level security;

create policy "Anyone can read card effect catalog"
  on public.card_effect_catalog for select
  using (true);


-- ARCHETYPE CATALOG
-- Curated rows are public. Learned rows are visible and writable only by owner.
alter table public.archetype_catalog enable row level security;

create policy "Read public and own archetype catalog rows"
  on public.archetype_catalog for select
  using (source = 'curated' or auth.uid() = user_id);

create policy "Users can create learned archetype catalog rows"
  on public.archetype_catalog for insert
  with check (source = 'learned' and auth.uid() = user_id);

create policy "Users can update learned archetype catalog rows"
  on public.archetype_catalog for update
  using (source = 'learned' and auth.uid() = user_id)
  with check (source = 'learned' and auth.uid() = user_id);


-- ROLE PERMISSIONS
alter table public.role_permissions enable row level security;

create policy "Anyone can read role permissions"
  on public.role_permissions for select
  using (true);

create policy "Admins can update role permissions"
  on public.role_permissions for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );


-- ROUTE PERFORMANCE EVENTS
alter table public.route_performance_events enable row level security;

create policy "Users can insert own route performance events"
  on public.route_performance_events for insert
  with check (auth.uid() = user_id);

create policy "Users can read own route performance events"
  on public.route_performance_events for select
  using (auth.uid() = user_id);

create policy "Admins can read route performance events"
  on public.route_performance_events for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );


-- ============================================================
-- SEED: DEFAULT ROLE PERMISSIONS
-- ============================================================

insert into public.role_permissions (role, menu_sections)
values
  ('user',  '["logs", "decks", "tournaments", "stats", "calculator"]'),
  ('admin', '["logs", "decks", "tournaments", "stats", "calculator"]');


-- ============================================================
-- SEED: EXCLUDED ARCHETYPES
-- From known-edge-cases.md section 1.1 and 5.2
-- The cron sync will upsert catalog entries — these exclusions
-- must be applied after each sync.
-- ============================================================

-- This is handled in the cron sync script, not here.
-- The sync script sets is_excluded = true for:
--   toedscruel-ex  (false positive — sprites are common support Pokemon)
--   other          (catch-all with no meaningful sprites)
-- See known-edge-cases.md for full reasoning.


-- ============================================================
-- NOTIFY POSTGREST
-- Required after schema changes for Supabase to pick them up.
-- ============================================================

-- Compatibility-phase round allocation: lock the owned tournament before
-- reading MAX(round_number), independent of deck/list orchestration.
create or replace function public.create_tournament_round(
  p_tournament_id text,
  p_round_id text,
  p_opponent_deck_name text,
  p_opponent_deck_sprites jsonb,
  p_result text,
  p_notes text
)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_round_number integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if nullif(btrim(p_tournament_id), '') is null
    or nullif(btrim(p_round_id), '') is null
    or nullif(btrim(p_result), '') is null
  then
    raise exception using errcode = '22023', message = 'Tournament round input is incomplete.';
  end if;
  if p_opponent_deck_sprites is null
    or jsonb_typeof(p_opponent_deck_sprites) is distinct from 'array'
    or jsonb_array_length(p_opponent_deck_sprites) > 2
  then
    raise exception using errcode = '22023', message = 'Opponent Pokemon are invalid.';
  end if;
  perform 1 from public.tournaments as tournament
    where tournament.id = p_tournament_id and tournament.user_id = v_user_id
    for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Tournament could not be found.';
  end if;
  select coalesce(max(round.round_number), 0) + 1 into v_round_number
    from public.tournament_rounds as round
    where round.tournament_id = p_tournament_id and round.user_id = v_user_id;
  insert into public.tournament_rounds (
    id, tournament_id, user_id, round_number, opponent_deck_name,
    opponent_deck_sprites, result, notes
  ) values (
    p_round_id, p_tournament_id, v_user_id, v_round_number,
    coalesce(p_opponent_deck_name, ''), p_opponent_deck_sprites,
    p_result, coalesce(p_notes, '')
  );
  return v_round_number;
end;
$function$;

comment on function public.create_tournament_round(text, text, text, jsonb, text, text) is
  'Creates the next numbered round for one owned tournament under a parent-row concurrency lock.';
revoke all on function public.create_tournament_round(text, text, text, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.create_tournament_round(text, text, text, jsonb, text, text)
  to authenticated;

notify pgrst, 'reload schema';

-- Make every future public-schema interface an explicit API decision. ALTER
-- DEFAULT PRIVILEGES only affects objects created after this migration, so
-- current table, sequence, and function grants remain unchanged.
--
-- Default privileges belong to the role that creates an object. PokeNotes
-- migrations and every current public object use the postgres owner. Fail
-- clearly instead of silently hardening an unrelated migration role.
do $migration_role$
begin
  if not pg_catalog.pg_has_role(current_user, 'postgres', 'MEMBER') then
    raise exception
      'Default privilege migration must run as postgres or a postgres member.';
  end if;
end
$migration_role$;

alter default privileges for role postgres in schema public
  revoke all privileges on tables
  from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all privileges on sequences
  from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions
  from anon, authenticated, service_role;

-- PostgreSQL's built-in function default grants EXECUTE to PUBLIC, and a
-- schema-scoped default REVOKE cannot subtract that global grant. Do not solve
-- that with a global default change: it would also affect future postgres-owned
-- routines in platform/extension schemas. Instead, revoke the implicit grant
-- immediately after application routines are created or replaced in public.
create schema if not exists private;

create or replace function private.harden_new_public_routine_privileges()
returns event_trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  routine_command record;
begin
  for routine_command in
    select command.object_identity
    from pg_catalog.pg_event_trigger_ddl_commands() as command
    join pg_catalog.pg_proc as routine
      on routine.oid = command.objid
    where command.schema_name = 'public'
      and command.object_type in ('function', 'procedure', 'aggregate')
      and not command.in_extension
      and routine.proowner = 'postgres'::regrole
  loop
    execute pg_catalog.format(
      'revoke execute on routine %s from public, anon, authenticated, service_role',
      routine_command.object_identity
    );
  end loop;
end;
$function$;

revoke all on function private.harden_new_public_routine_privileges()
  from public, anon, authenticated, service_role;

drop event trigger if exists pokenotes_harden_public_routine_privileges;
create event trigger pokenotes_harden_public_routine_privileges
  on ddl_command_end
  when tag in ('CREATE FUNCTION', 'CREATE PROCEDURE', 'CREATE AGGREGATE')
  execute function private.harden_new_public_routine_privileges();

-- Rollback (future objects only): restore the live pre-migration defaults with
-- the inverse statements below. Objects created, or routines replaced, while
-- the hardened boundary was active keep their explicit ACLs and must be
-- reviewed separately.
--
-- alter default privileges for role postgres in schema public
--   grant all privileges on tables to anon, authenticated, service_role;
-- alter default privileges for role postgres in schema public
--   grant all privileges on sequences to anon, authenticated, service_role;
-- alter default privileges for role postgres in schema public
--   grant execute on functions to anon, authenticated, service_role;
-- drop event trigger if exists pokenotes_harden_public_routine_privileges;
-- drop function if exists private.harden_new_public_routine_privileges();

-- End future-object default privilege boundary.

-- Reject malformed direct-RPC snapshots before they consume storage or become
-- a public read-time failure. This intentionally validates only the stable v1
-- envelope: deeper Battle Log fields remain governed by the application codec,
-- and no product-level payload byte limit is introduced here.
alter table public.log_shares
  add constraint log_shares_payload_v1_envelope
  check (
    jsonb_typeof(payload) is not distinct from 'object'
    and payload ->> 'version' is not distinct from 'v1'
    and jsonb_typeof(payload -> 'log') is not distinct from 'object'
    and jsonb_typeof(payload #> '{log,sections}') is not distinct from 'array'
    and jsonb_typeof(payload -> 'linkedStrategyLabel') is not distinct from 'string'
    and (
      not (payload ? 'linkedDeckListSortedCards')
      or jsonb_typeof(payload -> 'linkedDeckListSortedCards') in ('array', 'null')
    )
  ) not valid;

-- Privacy-safe production evidence found 71/71 existing rows conforming. The
-- two-phase form keeps the preflight and enforcement contract explicit: new
-- writes are checked as soon as the constraint is added, then historical rows
-- must pass before the migration can complete.
alter table public.log_shares
  validate constraint log_shares_payload_v1_envelope;

-- End log-share v1 payload envelope boundary.

-- ============================================================
-- COHERENT OPTIONAL DECK LINKS
-- Foreign-key unlinking must clear the corresponding list link.
-- ============================================================

-- Keep optional deck and deck-list links in a single coherent state for every
-- write path, including foreign-key actions triggered by direct deck deletes.

create or replace function public.clear_orphaned_deck_list_link()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if new.linked_deck_id is null then
    new.linked_deck_list_id := null;
  end if;

  return new;
end;
$$;

revoke all on function public.clear_orphaned_deck_list_link()
  from public, anon, authenticated;

drop trigger if exists clear_orphaned_log_deck_list_link
  on public.logs;
create trigger clear_orphaned_log_deck_list_link
  before insert or update on public.logs
  for each row execute function public.clear_orphaned_deck_list_link();

drop trigger if exists clear_orphaned_tournament_deck_list_link
  on public.tournaments;
create trigger clear_orphaned_tournament_deck_list_link
  before insert or update on public.tournaments
  for each row execute function public.clear_orphaned_deck_list_link();

alter table public.logs
  add constraint logs_linked_deck_list_requires_deck
  check (linked_deck_id is not null or linked_deck_list_id is null)
  not valid;

alter table public.tournaments
  add constraint tournaments_linked_deck_list_requires_deck
  check (linked_deck_id is not null or linked_deck_list_id is null)
  not valid;

alter table public.logs
  validate constraint logs_linked_deck_list_requires_deck;

alter table public.tournaments
  validate constraint tournaments_linked_deck_list_requires_deck;

notify pgrst, 'reload schema';


-- ============================================================
-- TENANT PARENT OWNERSHIP
-- Parent and child records must belong to the same account.
-- ============================================================

-- Enforce account ownership across parent/child relationships without changing data.
-- Existing rows were audited read-only before this migration; every relationship matched.

alter table public.decks
  add constraint decks_user_id_id_unique
  unique (user_id, id);

alter table public.tournaments
  add constraint tournaments_user_id_id_unique
  unique (user_id, id);

alter table public.deck_lists
  add constraint deck_lists_owner_deck_fkey
  foreign key (user_id, deck_id)
  references public.decks (user_id, id)
  on delete cascade
  not valid;

alter table public.deck_matchups
  add constraint deck_matchups_owner_deck_fkey
  foreign key (user_id, deck_id)
  references public.decks (user_id, id)
  on delete cascade
  not valid;

alter table public.tournament_rounds
  add constraint tournament_rounds_owner_tournament_fkey
  foreign key (user_id, tournament_id)
  references public.tournaments (user_id, id)
  on delete cascade
  not valid;

alter table public.deck_log_stats
  add constraint deck_log_stats_owner_deck_fkey
  foreign key (user_id, deck_id)
  references public.decks (user_id, id)
  on delete cascade
  not valid;

-- PostgreSQL 17 can null only the optional deck reference while preserving the
-- required owner column in these composite foreign keys.
alter table public.logs
  add constraint logs_owner_linked_deck_fkey
  foreign key (user_id, linked_deck_id)
  references public.decks (user_id, id)
  on delete set null (linked_deck_id)
  not valid;

alter table public.tournaments
  add constraint tournaments_owner_linked_deck_fkey
  foreign key (user_id, linked_deck_id)
  references public.decks (user_id, id)
  on delete set null (linked_deck_id)
  not valid;

alter table public.deck_lists
  validate constraint deck_lists_owner_deck_fkey;

alter table public.deck_matchups
  validate constraint deck_matchups_owner_deck_fkey;

alter table public.tournament_rounds
  validate constraint tournament_rounds_owner_tournament_fkey;

alter table public.deck_log_stats
  validate constraint deck_log_stats_owner_deck_fkey;

alter table public.logs
  validate constraint logs_owner_linked_deck_fkey;

alter table public.tournaments
  validate constraint tournaments_owner_linked_deck_fkey;

-- The composite constraints supersede the original ID-only relationships.
alter table public.deck_lists
  drop constraint deck_lists_deck_id_fkey;

alter table public.deck_matchups
  drop constraint deck_matchups_deck_id_fkey;

alter table public.tournament_rounds
  drop constraint tournament_rounds_tournament_id_fkey;

alter table public.deck_log_stats
  drop constraint deck_log_stats_deck_id_fkey;

alter table public.logs
  drop constraint logs_linked_deck_id_fkey;

alter table public.tournaments
  drop constraint tournaments_linked_deck_id_fkey;

-- A list link remains compatibility-backed by decks.deck_lists until the
-- account-scoped ID collisions are re-keyed. Authenticated writes must select
-- a list that is actually present on the caller's owned deck.
alter policy "Users can insert own logs"
  on public.logs
  with check (
    (select auth.uid()) = user_id
    and (
      (linked_deck_id is null and linked_deck_list_id is null)
      or exists (
        select 1
        from public.decks as parent
        where parent.id = logs.linked_deck_id
          and parent.user_id = (select auth.uid())
          and (
            logs.linked_deck_list_id is null
            or exists (
              select 1
              from jsonb_array_elements(
                case
                  when jsonb_typeof(parent.deck_lists) = 'array'
                    then parent.deck_lists
                  else '[]'::jsonb
                end
              ) as item(value)
              where item.value ->> 'id' = logs.linked_deck_list_id
            )
          )
      )
    )
  );

alter policy "Users can update own logs"
  on public.logs
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      (linked_deck_id is null and linked_deck_list_id is null)
      or exists (
        select 1
        from public.decks as parent
        where parent.id = logs.linked_deck_id
          and parent.user_id = (select auth.uid())
          and (
            logs.linked_deck_list_id is null
            or exists (
              select 1
              from jsonb_array_elements(
                case
                  when jsonb_typeof(parent.deck_lists) = 'array'
                    then parent.deck_lists
                  else '[]'::jsonb
                end
              ) as item(value)
              where item.value ->> 'id' = logs.linked_deck_list_id
            )
          )
      )
    )
  );

alter policy "Users can insert own tournaments"
  on public.tournaments
  with check (
    (select auth.uid()) = user_id
    and (
      (linked_deck_id is null and linked_deck_list_id is null)
      or exists (
        select 1
        from public.decks as parent
        where parent.id = tournaments.linked_deck_id
          and parent.user_id = (select auth.uid())
          and (
            tournaments.linked_deck_list_id is null
            or exists (
              select 1
              from jsonb_array_elements(
                case
                  when jsonb_typeof(parent.deck_lists) = 'array'
                    then parent.deck_lists
                  else '[]'::jsonb
                end
              ) as item(value)
              where item.value ->> 'id' = tournaments.linked_deck_list_id
            )
          )
      )
    )
  );

alter policy "Users can update own tournaments"
  on public.tournaments
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      (linked_deck_id is null and linked_deck_list_id is null)
      or exists (
        select 1
        from public.decks as parent
        where parent.id = tournaments.linked_deck_id
          and parent.user_id = (select auth.uid())
          and (
            tournaments.linked_deck_list_id is null
            or exists (
              select 1
              from jsonb_array_elements(
                case
                  when jsonb_typeof(parent.deck_lists) = 'array'
                    then parent.deck_lists
                  else '[]'::jsonb
                end
              ) as item(value)
              where item.value ->> 'id' = tournaments.linked_deck_list_id
            )
          )
      )
    )
  );

create or replace function public.get_initial_logs_page_data(p_limit integer default 51)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with request_context as (
    select (select auth.uid()) as user_id
  ),
  stats as (
    select
      coalesce(user_log_stats.games_played, 0) as games_played,
      coalesce(user_log_stats.games_won, 0) as games_won,
      coalesce(user_log_stats.games_lost, 0) as games_lost
    from request_context
    left join public.user_log_stats
      on user_log_stats.user_id = request_context.user_id
  ),
  ordered_logs as (
    select
      logs.id,
      logs.date,
      logs.result,
      logs.format,
      logs.go_order,
      logs.self_player_name,
      logs.self_deck_name,
      logs.self_deck_sprites,
      logs.opponent_player_name,
      logs.opponent_deck_name,
      logs.opponent_deck_sprites,
      logs.total_turns,
      logs.linked_deck_id,
      logs.linked_deck_list_id,
      logs.imported_at,
      logs.user_id
    from public.logs
    cross join request_context
    where logs.user_id = request_context.user_id
    order by logs.date desc, logs.imported_at desc, logs.id desc
    limit greatest(1, least(coalesce(p_limit, 51), 101))
  ),
  enriched_logs as (
    select
      ordered_logs.id,
      ordered_logs.date,
      ordered_logs.result,
      ordered_logs.format,
      ordered_logs.go_order,
      ordered_logs.self_player_name,
      ordered_logs.self_deck_name,
      ordered_logs.self_deck_sprites,
      ordered_logs.opponent_player_name,
      ordered_logs.opponent_deck_name,
      ordered_logs.opponent_deck_sprites,
      ordered_logs.total_turns,
      ordered_logs.linked_deck_id,
      ordered_logs.linked_deck_list_id,
      ordered_logs.imported_at,
      coalesce(relational_list.name, aggregate_list.name) as linked_deck_list_name
    from ordered_logs
    left join public.deck_lists as relational_list
      on relational_list.user_id = ordered_logs.user_id
      and relational_list.deck_id = ordered_logs.linked_deck_id
      and relational_list.id = ordered_logs.linked_deck_list_id
    left join public.decks
      on relational_list.id is null
      and decks.user_id = ordered_logs.user_id
      and decks.id = ordered_logs.linked_deck_id
    left join lateral (
      select deck_list ->> 'name' as name
      from jsonb_array_elements(
        case
          when jsonb_typeof(decks.deck_lists) = 'array' then decks.deck_lists
          else '[]'::jsonb
        end
      ) as deck_list
      where relational_list.id is null
        and deck_list ->> 'id' = ordered_logs.linked_deck_list_id
      limit 1
    ) as aggregate_list on true
  )
  select jsonb_build_object(
    'stats',
    jsonb_build_object(
      'games_played', stats.games_played,
      'games_won', stats.games_won,
      'games_lost', stats.games_lost
    ),
    'logs',
    coalesce(
      (
        select jsonb_agg(
          to_jsonb(enriched_logs)
          order by enriched_logs.date desc, enriched_logs.imported_at desc, enriched_logs.id desc
        )
        from enriched_logs
      ),
      '[]'::jsonb
    )
  )
  from stats;
$$;

revoke execute on function public.get_initial_logs_page_data(integer) from public, anon;
grant execute on function public.get_initial_logs_page_data(integer) to authenticated;

notify pgrst, 'reload schema';

-- Keep each Deck Aggregate write inside one database transaction. The function
-- locks the owned parent row before it reads or mutates the Legacy Deck Copy,
-- then upserts the matching Relational Deck Records before updating the JSON.
-- Any error (including an unresolved historical global-ID collision) rolls the
-- complete function call back.

create or replace function public.commit_deck_aggregate_child(
  p_deck_id text,
  p_kind text,
  p_operation text,
  p_child jsonb,
  p_expected_child_updated_at text,
  p_updated_at timestamptz
)
returns text
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_child_id text;
  v_child_updated_at timestamptz;
  v_current_child jsonb;
  v_current_child_updated_at text;
  v_current_child_updated_at_timestamp timestamptz;
  v_current_children jsonb;
  v_next_children jsonb;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  if nullif(btrim(p_deck_id), '') is null then
    raise exception using
      errcode = '22023',
      message = 'Deck id is required.';
  end if;

  if p_kind is null or p_kind not in ('deck-list', 'matchup') then
    raise exception using
      errcode = '22023',
      message = 'Unsupported deck aggregate child kind.';
  end if;

  if p_operation is null or p_operation not in ('create', 'update') then
    raise exception using
      errcode = '22023',
      message = 'Unsupported deck aggregate operation.';
  end if;

  if p_updated_at is null then
    raise exception using
      errcode = '22023',
      message = 'An update timestamp is required.';
  end if;

  if p_child is null or jsonb_typeof(p_child) is distinct from 'object' then
    raise exception using
      errcode = '22023',
      message = 'Deck aggregate child must be a JSON object.';
  end if;

  v_child_id := p_child ->> 'id';
  if nullif(btrim(v_child_id), '') is null then
    raise exception using
      errcode = '22023',
      message = 'Deck aggregate child id is required.';
  end if;

  if nullif(btrim(coalesce(p_child ->> 'updatedAt', '')), '') is null then
    raise exception using
      errcode = '22023',
      message = 'Deck aggregate child update timestamp is required.';
  end if;

  begin
    v_child_updated_at := (p_child ->> 'updatedAt')::timestamptz;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      raise exception using
        errcode = '22023',
        message = 'Deck aggregate child update timestamp is invalid.';
  end;

  if v_child_updated_at is distinct from p_updated_at then
    raise exception using
      errcode = '22023',
      message = 'Deck aggregate child and commit timestamps must match.';
  end if;

  -- Validate the fields a direct RPC caller could otherwise use to create an
  -- unusable child. Optional notes and planning fields intentionally retain the
  -- application's existing free-text behaviour.
  if p_kind = 'deck-list' then
    if nullif(btrim(coalesce(p_child ->> 'name', '')), '') is null then
      raise exception using
        errcode = '22023',
        message = 'Deck list name is required.';
    end if;

    if nullif(btrim(coalesce(p_child ->> 'rawList', '')), '') is null then
      raise exception using
        errcode = '22023',
        message = 'Deck list text is required.';
    end if;

    if jsonb_typeof(p_child -> 'parsedCards') is distinct from 'array'
      or jsonb_typeof(p_child -> 'sortedCards') is distinct from 'array'
      or jsonb_typeof(p_child -> 'sortedCardsVersion') is distinct from 'number'
    then
      raise exception using
        errcode = '22023',
        message = 'Deck list card data is invalid.';
    end if;
  else
    if nullif(btrim(coalesce(p_child ->> 'deckName', '')), '') is null then
      raise exception using
        errcode = '22023',
        message = 'Matchup deck name is required.';
    end if;

    if nullif(btrim(coalesce(p_child ->> 'format', '')), '') is null then
      raise exception using
        errcode = '22023',
        message = 'Matchup format is required.';
    end if;

    if jsonb_typeof(p_child -> 'deckPokemon') is distinct from 'array' then
      raise exception using
        errcode = '22023',
        message = 'Matchup Pokemon are invalid.';
    end if;

    if jsonb_array_length(p_child -> 'deckPokemon') not between 1 and 2
      or exists (
        select 1
        from jsonb_array_elements(p_child -> 'deckPokemon') as pokemon(value)
        where jsonb_typeof(pokemon.value) <> 'string'
          or nullif(btrim(pokemon.value #>> '{}'), '') is null
      )
    then
      raise exception using
        errcode = '22023',
        message = 'Matchup Pokemon are invalid.';
    end if;

    if coalesce(p_child ->> 'goPreference', '') not in ('', 'First', 'Second') then
      raise exception using
        errcode = '22023',
        message = 'Matchup go preference is invalid.';
    end if;
  end if;

  -- RLS remains active because this is SECURITY INVOKER. The explicit owner
  -- predicate is defense in depth and ensures the locked row is the caller's.
  select case
      when p_kind = 'deck-list' then deck.deck_lists
      else deck.matchups
    end
  into v_current_children
  from public.decks as deck
  where deck.id = p_deck_id
    and deck.user_id = v_user_id
  for update;

  if not found then
    return 'deck-not-found';
  end if;

  if jsonb_typeof(v_current_children) is distinct from 'array' then
    v_current_children := '[]'::jsonb;
  end if;

  -- A same-parent duplicate makes child identity ambiguous. The live audit
  -- currently reports none; fail closed if corruption appears later instead of
  -- replacing or upserting multiple entries with one submitted value.
  if exists (
    select 1
    from jsonb_array_elements(v_current_children) as child(value)
    where jsonb_typeof(child.value) = 'object'
      and coalesce(child.value ->> 'id', '') <> ''
    group by child.value ->> 'id'
    having count(*) > 1
  ) then
    return 'conflict';
  end if;

  select child.value
  into v_current_child
  from jsonb_array_elements(v_current_children)
    with ordinality as child(value, ordinal)
  where child.value ->> 'id' = v_child_id
  order by child.ordinal
  limit 1;

  if p_operation = 'create' then
    -- Generated child IDs should be unique inside one Deck Aggregate. Treat an
    -- unexpected duplicate as a concurrency conflict instead of adding a second
    -- ambiguous child.
    if v_current_child is not null then
      return 'conflict';
    end if;

    if (
      p_kind = 'deck-list'
      and exists (
        select 1
        from public.deck_lists as relational_child
        where relational_child.user_id = v_user_id
          and relational_child.deck_id = p_deck_id
          and relational_child.id = v_child_id
      )
    ) or (
      p_kind = 'matchup'
      and exists (
        select 1
        from public.deck_matchups as relational_child
        where relational_child.user_id = v_user_id
          and relational_child.deck_id = p_deck_id
          and relational_child.id = v_child_id
      )
    ) then
      return 'conflict';
    end if;

    if p_kind = 'deck-list' then
      v_next_children := jsonb_build_array(p_child) || v_current_children;
    else
      v_next_children := v_current_children || jsonb_build_array(p_child);
    end if;
  else
    if v_current_child is null then
      return 'child-not-found';
    end if;

    v_current_child_updated_at := coalesce(
      nullif(v_current_child ->> 'updatedAt', ''),
      v_current_child ->> 'updated_at',
      ''
    );

    -- Updates carry the version observed by the editor. This prevents two tabs
    -- editing the same child from silently replacing one another. Updates to
    -- different children remain merge-safe because the parent is re-read after
    -- its row lock is acquired.
    if p_expected_child_updated_at is null
      or v_current_child_updated_at <> p_expected_child_updated_at
    then
      return 'conflict';
    end if;

    if v_current_child_updated_at <> '' then
      begin
        v_current_child_updated_at_timestamp := v_current_child_updated_at::timestamptz;
      exception
        when invalid_datetime_format or datetime_field_overflow then
          return 'conflict';
      end;

      if p_updated_at <= v_current_child_updated_at_timestamp then
        return 'conflict';
      end if;
    end if;

    select coalesce(
      jsonb_agg(
        case
          when child.value ->> 'id' = v_child_id then p_child
          else child.value
        end
        order by child.ordinal
      ),
      '[]'::jsonb
    )
    into v_next_children
    from jsonb_array_elements(v_current_children)
      with ordinality as child(value, ordinal);
  end if;

  if p_kind = 'deck-list' then
    insert into public.deck_lists (
      id,
      user_id,
      deck_id,
      name,
      format,
      date,
      created_by,
      notes,
      raw_list,
      parsed_cards,
      sorted_cards,
      sorted_cards_version,
      position,
      created_at,
      updated_at
    )
    select
      child.value ->> 'id',
      v_user_id,
      p_deck_id,
      coalesce(child.value ->> 'name', ''),
      coalesce(child.value ->> 'format', ''),
      coalesce(child.value ->> 'date', ''),
      coalesce(
        nullif(child.value ->> 'createdBy', ''),
        child.value ->> 'created_by',
        ''
      ),
      coalesce(child.value ->> 'notes', ''),
      coalesce(
        nullif(child.value ->> 'rawList', ''),
        child.value ->> 'raw_list',
        ''
      ),
      case
        when jsonb_typeof(child.value -> 'parsedCards') = 'array'
          then child.value -> 'parsedCards'
        else coalesce(
          nullif(child.value -> 'parsed_cards', 'null'::jsonb),
          '[]'::jsonb
        )
      end,
      case
        when jsonb_typeof(child.value -> 'sortedCards') = 'array'
          then child.value -> 'sortedCards'
        else coalesce(
          nullif(child.value -> 'sorted_cards', 'null'::jsonb),
          '[]'::jsonb
        )
      end,
      case
        when jsonb_typeof(child.value -> 'sortedCardsVersion') = 'number'
          then (child.value ->> 'sortedCardsVersion')::integer
        when jsonb_typeof(child.value -> 'sorted_cards_version') = 'number'
          then (child.value ->> 'sorted_cards_version')::integer
        else null
      end,
      child.ordinal::integer - 1,
      coalesce(
        nullif(child.value ->> 'createdAt', ''),
        nullif(child.value ->> 'created_at', ''),
        nullif(child.value ->> 'updatedAt', ''),
        nullif(child.value ->> 'updated_at', ''),
        p_updated_at::text
      )::timestamptz,
      coalesce(
        nullif(child.value ->> 'updatedAt', ''),
        nullif(child.value ->> 'updated_at', ''),
        p_updated_at::text
      )::timestamptz
    from jsonb_array_elements(v_next_children)
      with ordinality as child(value, ordinal)
    where jsonb_typeof(child.value) = 'object'
      and coalesce(child.value ->> 'id', '') <> ''
      and coalesce(child.value ->> 'name', '') <> ''
    on conflict (user_id, deck_id, id)
    do update set
      name = excluded.name,
      format = excluded.format,
      date = excluded.date,
      created_by = excluded.created_by,
      notes = excluded.notes,
      raw_list = excluded.raw_list,
      parsed_cards = excluded.parsed_cards,
      sorted_cards = excluded.sorted_cards,
      sorted_cards_version = excluded.sorted_cards_version,
      position = excluded.position,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at;

    update public.decks as deck
    set
      deck_lists = v_next_children,
      updated_at = p_updated_at
    where deck.id = p_deck_id
      and deck.user_id = v_user_id;
  else
    insert into public.deck_matchups (
      id,
      user_id,
      deck_id,
      deck_name,
      deck_pokemon,
      format,
      go_preference,
      matchup_favor,
      ideal_bench,
      techs_needed,
      matchup_plan,
      position,
      created_at,
      updated_at
    )
    select
      child.value ->> 'id',
      v_user_id,
      p_deck_id,
      coalesce(
        nullif(child.value ->> 'deckName', ''),
        child.value ->> 'deck_name',
        ''
      ),
      case
        when jsonb_typeof(child.value -> 'deckPokemon') = 'array'
          then child.value -> 'deckPokemon'
        else coalesce(
          nullif(child.value -> 'deck_pokemon', 'null'::jsonb),
          '[]'::jsonb
        )
      end,
      coalesce(child.value ->> 'format', ''),
      case coalesce(
        nullif(child.value ->> 'goPreference', ''),
        child.value ->> 'go_preference',
        ''
      )
        when 'First' then 'First'
        when 'Second' then 'Second'
        else ''
      end,
      coalesce(
        nullif(child.value ->> 'matchupFavor', ''),
        child.value ->> 'matchup_favor',
        ''
      ),
      coalesce(
        nullif(child.value ->> 'idealBench', ''),
        child.value ->> 'ideal_bench',
        ''
      ),
      coalesce(
        nullif(child.value ->> 'techsNeeded', ''),
        child.value ->> 'techs_needed',
        ''
      ),
      coalesce(
        nullif(child.value ->> 'matchupPlan', ''),
        child.value ->> 'matchup_plan',
        ''
      ),
      child.ordinal::integer - 1,
      coalesce(
        nullif(child.value ->> 'createdAt', ''),
        nullif(child.value ->> 'created_at', ''),
        p_updated_at::text
      )::timestamptz,
      coalesce(
        nullif(child.value ->> 'updatedAt', ''),
        nullif(child.value ->> 'updated_at', ''),
        p_updated_at::text
      )::timestamptz
    from jsonb_array_elements(v_next_children)
      with ordinality as child(value, ordinal)
    where jsonb_typeof(child.value) = 'object'
      and coalesce(child.value ->> 'id', '') <> ''
      and coalesce(
        nullif(child.value ->> 'deckName', ''),
        child.value ->> 'deck_name',
        ''
      ) <> ''
    on conflict (user_id, deck_id, id)
    do update set
      deck_name = excluded.deck_name,
      deck_pokemon = excluded.deck_pokemon,
      format = excluded.format,
      go_preference = excluded.go_preference,
      matchup_favor = excluded.matchup_favor,
      ideal_bench = excluded.ideal_bench,
      techs_needed = excluded.techs_needed,
      matchup_plan = excluded.matchup_plan,
      position = excluded.position,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at;

    update public.decks as deck
    set
      matchups = v_next_children,
      updated_at = p_updated_at
    where deck.id = p_deck_id
      and deck.user_id = v_user_id;
  end if;

  return 'committed';
end;
$function$;

comment on function public.commit_deck_aggregate_child(
  text,
  text,
  text,
  jsonb,
  text,
  timestamptz
) is
  'Atomically locks and updates one owned Deck Aggregate child in both compatibility stores.';

revoke all on function public.commit_deck_aggregate_child(
  text,
  text,
  text,
  jsonb,
  text,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.commit_deck_aggregate_child(
  text,
  text,
  text,
  jsonb,
  text,
  timestamptz
) to authenticated;

notify pgrst, 'reload schema';




-- ============================================================
-- SECURITY HARDENING: SHARES AND PROFILE AUTHORITY
-- Final bootstrap state. Existing projects receive the same contract through
-- the staged official migrations in supabase/migrations.
-- ============================================================

create schema if not exists private;
grant usage on schema private to authenticated, service_role;

create table if not exists private.deck_aggregate_rekey_ledger (
  kind text not null check (kind in ('deck-list', 'matchup')),
  user_id uuid not null,
  deck_id text not null,
  old_id text not null,
  new_id text not null,
  repaired_at timestamptz not null,
  compatibility_until timestamptz not null,
  primary key (kind, user_id, deck_id, old_id),
  unique (kind, new_id)
);

alter table private.deck_aggregate_rekey_ledger enable row level security;
revoke all privileges on table private.deck_aggregate_rekey_ledger
  from public, anon, authenticated, service_role;

comment on table private.deck_aggregate_rekey_ledger is
  'Private old-to-new Deck Aggregate ID evidence retained through the 30-day compatibility period; contains identifiers only, never user content.';

-- SHARES: seven-day lifetime, deletion-proof rolling quota, token-only reads.
alter table public.log_shares
  alter column expires_at set default (now() + interval '7 days');

create index if not exists log_shares_owner_created_at
  on public.log_shares (owner_user_id, created_at desc);

create table if not exists private.log_share_creation_events (
  id bigint generated always as identity primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table private.log_share_creation_events enable row level security;
revoke all privileges on table private.log_share_creation_events
  from public, anon, authenticated;
grant all privileges on table private.log_share_creation_events to service_role;

create index if not exists log_share_creation_events_owner_created_at
  on private.log_share_creation_events (owner_user_id, created_at desc);

create or replace function private.enforce_log_share_creation()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  created_time timestamptz := statement_timestamp();
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if new.owner_user_id <> current_user_id then
    raise exception using
      errcode = '42501',
      message = 'Share ownership must match the signed-in user.';
  end if;

  if new.source_log_id is null or not exists (
    select 1
    from public.logs as source_log
    where source_log.id = new.source_log_id
      and source_log.user_id = current_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'LOG_SHARE_SOURCE_NOT_FOUND';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pokenotes-log-share:' || current_user_id::text, 0)
  );

  delete from private.log_share_creation_events as old_event
  where old_event.owner_user_id = current_user_id
    and old_event.created_at <= created_time - interval '8 days';

  if (
    select count(*)
    from private.log_share_creation_events as recent_event
    where recent_event.owner_user_id = current_user_id
      and recent_event.created_at > created_time - interval '24 hours'
  ) >= 50 then
    raise exception using
      errcode = 'P0001',
      message = 'LOG_SHARE_24_HOUR_LIMIT_REACHED';
  end if;

  insert into private.log_share_creation_events (owner_user_id, created_at)
  values (current_user_id, created_time);

  new.expires_at := created_time + interval '7 days';
  new.created_at := created_time;
  new.updated_at := created_time;
  return new;
end;
$$;

revoke all on function private.enforce_log_share_creation()
  from public, anon, authenticated;

drop trigger if exists enforce_log_share_creation on public.log_shares;
create trigger enforce_log_share_creation
  before insert on public.log_shares
  for each row execute function private.enforce_log_share_creation();

create or replace function public.get_active_log_share(p_token text)
returns table (
  id text,
  source_log_id text,
  payload jsonb,
  expires_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select share.id, share.source_log_id, share.payload, share.expires_at, share.created_at
  from public.log_shares as share
  where share.id = p_token
    and share.expires_at > statement_timestamp()
  limit 1;
$$;

create or replace function public.create_log_share(
  p_token text,
  p_source_log_id text,
  p_payload jsonb
)
returns table (
  id text,
  source_log_id text,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  created_time timestamptz := statement_timestamp();
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{16,128}$' then
    raise exception using errcode = '22023', message = 'Invalid share token.';
  end if;

  if p_payload is not null and octet_length(p_payload::text) > 262144 then
    raise exception using
      errcode = 'P0001',
      message = 'LOG_SHARE_PAYLOAD_TOO_LARGE';
  end if;

  return query
  insert into public.log_shares (
    id, owner_user_id, source_log_id, payload, expires_at, created_at, updated_at
  )
  values (
    p_token,
    current_user_id,
    p_source_log_id,
    p_payload,
    created_time + interval '7 days',
    created_time,
    created_time
  )
  returning
    log_shares.id,
    log_shares.source_log_id,
    log_shares.expires_at,
    log_shares.created_at;
end;
$$;

drop policy if exists "Anyone can read log shares" on public.log_shares;
drop policy if exists "Anyone can read active log shares" on public.log_shares;
drop policy if exists "Owners can read own log shares" on public.log_shares;
drop policy if exists "Owners can create log shares" on public.log_shares;
drop policy if exists "Owners can delete log shares" on public.log_shares;

create policy "Owners can read own log shares"
  on public.log_shares for select to authenticated
  using ((select auth.uid()) = owner_user_id);

create policy "Owners can delete log shares"
  on public.log_shares for delete to authenticated
  using ((select auth.uid()) = owner_user_id);

revoke all privileges on table public.log_shares from anon, authenticated;
grant select, delete on table public.log_shares to authenticated;
grant all privileges on table public.log_shares to service_role;

revoke all on function public.get_active_log_share(text)
  from public, anon, authenticated;
grant execute on function public.get_active_log_share(text)
  to anon, authenticated, service_role;

revoke all on function public.create_log_share(text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_log_share(text, text, jsonb)
  to authenticated, service_role;

alter table public.log_shares
  add constraint log_shares_payload_max_256k
  check (octet_length(payload::text) <= 262144)
  not valid;

alter table public.log_shares
  validate constraint log_shares_payload_max_256k;

-- Serialize share creation and revocation per owner/log so concurrent create
-- requests cannot leave a second, hidden public token behind.
create or replace function public.create_log_share(
  p_token text,
  p_source_log_id text,
  p_payload jsonb
)
returns table (
  id text,
  source_log_id text,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  created_time timestamptz := statement_timestamp();
  active_share public.log_shares%rowtype;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{16,128}$' then
    raise exception using errcode = '22023', message = 'Invalid share token.';
  end if;

  if p_payload is not null and octet_length(p_payload::text) > 262144 then
    raise exception using errcode = 'P0001', message = 'LOG_SHARE_PAYLOAD_TOO_LARGE';
  end if;

  if p_source_log_id is null or not exists (
    select 1
    from public.logs as source_log
    where source_log.id = p_source_log_id
      and source_log.user_id = current_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'LOG_SHARE_SOURCE_NOT_FOUND';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'pokenotes-log-share-source:' || current_user_id::text || ':' || p_source_log_id,
      0
    )
  );

  select share.*
  into active_share
  from public.log_shares as share
  where share.owner_user_id = current_user_id
    and share.source_log_id = p_source_log_id
    and share.expires_at > created_time
  order by share.created_at desc, share.id desc
  limit 1;

  if found then
    update public.log_shares as duplicate_share
    set
      expires_at = least(duplicate_share.expires_at, created_time),
      updated_at = created_time
    where duplicate_share.owner_user_id = current_user_id
      and duplicate_share.source_log_id = p_source_log_id
      and duplicate_share.id <> active_share.id
      and duplicate_share.expires_at > created_time;

    return query
    select active_share.id, active_share.source_log_id,
      active_share.expires_at, active_share.created_at;
    return;
  end if;

  return query
  insert into public.log_shares (
    id, owner_user_id, source_log_id, payload, expires_at, created_at, updated_at
  )
  values (
    p_token, current_user_id, p_source_log_id, p_payload,
    created_time + interval '7 days', created_time, created_time
  )
  returning log_shares.id, log_shares.source_log_id,
    log_shares.expires_at, log_shares.created_at;
end;
$$;

create or replace function public.revoke_log_share(p_share_id text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_source_log_id text;
  deleted_count bigint;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if p_share_id is null or btrim(p_share_id) = '' then
    raise exception using errcode = '22023', message = 'Share id is required.';
  end if;

  select share.source_log_id
  into target_source_log_id
  from public.log_shares as share
  where share.id = p_share_id
    and share.owner_user_id = current_user_id;

  if not found then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'pokenotes-log-share-source:' || current_user_id::text || ':' ||
        coalesce(target_source_log_id, 'legacy:' || p_share_id),
      0
    )
  );

  if target_source_log_id is null then
    delete from public.log_shares as owned_share
    where owned_share.id = p_share_id
      and owned_share.owner_user_id = current_user_id;
  else
    delete from public.log_shares as owned_share
    where owned_share.owner_user_id = current_user_id
      and owned_share.source_log_id = target_source_log_id;
  end if;

  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

revoke all on function public.create_log_share(text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.create_log_share(text, text, jsonb)
  to authenticated, service_role;

revoke all on function public.revoke_log_share(text)
  from public, anon, authenticated, service_role;
grant execute on function public.revoke_log_share(text)
  to authenticated, service_role;

notify pgrst, 'reload schema';

-- End atomic log-share lifecycle boundary.

-- PROFILES: five direct editable fields; database role is authoritative.
create or replace function private.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as profile
    where profile.id = auth.uid()
      and profile.role = 'admin'
  );
$$;

revoke all on function private.is_current_user_admin()
  from public, anon, authenticated;
grant execute on function private.is_current_user_admin()
  to authenticated, service_role;

drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Admins can read all profiles" on public.profiles;
drop policy if exists "Users and admins can read profiles" on public.profiles;

create policy "Users and admins can read profiles"
  on public.profiles for select to authenticated
  using (
    (select auth.uid()) = id
    or (select private.is_current_user_admin())
  );

create policy "Users can update own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

revoke insert, update on table public.profiles from authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name, first_name, last_name, ptcgl_username, avatar_color)
  on table public.profiles to authenticated;
grant all privileges on table public.profiles to service_role;

create or replace function public.sync_current_profile()
returns public.profiles
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  auth_email text;
  auth_created_at timestamptz;
  auth_last_sign_in_at timestamptz;
  auth_metadata jsonb;
  fallback_display_name text;
  auth_first_name text;
  auth_last_name text;
  synced_profile public.profiles;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  select
    coalesce(auth_user.email, ''),
    auth_user.created_at,
    auth_user.last_sign_in_at,
    coalesce(auth_user.raw_user_meta_data, '{}'::jsonb)
  into auth_email, auth_created_at, auth_last_sign_in_at, auth_metadata
  from auth.users as auth_user
  where auth_user.id = current_user_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'AUTH_USER_NOT_FOUND';
  end if;

  auth_first_name := coalesce(nullif(btrim(auth_metadata ->> 'given_name'), ''), '');
  auth_last_name := coalesce(nullif(btrim(auth_metadata ->> 'family_name'), ''), '');
  fallback_display_name := coalesce(
    nullif(btrim(auth_metadata ->> 'full_name'), ''),
    nullif(btrim(auth_metadata ->> 'name'), ''),
    nullif(btrim(concat_ws(' ', auth_first_name, auth_last_name)), ''),
    nullif(split_part(auth_email, '@', 1), ''),
    'Trainer'
  );

  insert into public.profiles (
    id,
    display_name,
    first_name,
    last_name,
    email,
    auth_account_created_at,
    last_login_at,
    last_active_at
  )
  values (
    current_user_id,
    fallback_display_name,
    auth_first_name,
    auth_last_name,
    auth_email,
    auth_created_at,
    auth_last_sign_in_at,
    statement_timestamp()
  )
  on conflict (id) do update
  set
    display_name = case
      when btrim(profiles.display_name) = '' then excluded.display_name
      else profiles.display_name
    end,
    first_name = case
      when btrim(profiles.first_name) = '' then excluded.first_name
      else profiles.first_name
    end,
    last_name = case
      when btrim(profiles.last_name) = '' then excluded.last_name
      else profiles.last_name
    end,
    email = excluded.email,
    auth_account_created_at = excluded.auth_account_created_at,
    last_login_at = excluded.last_login_at,
    last_active_at = excluded.last_active_at
  returning * into synced_profile;

  return synced_profile;
end;
$$;

create or replace function public.touch_current_profile_activity()
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  activity_time timestamptz;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  update public.profiles as profile
  set last_active_at = statement_timestamp()
  where profile.id = current_user_id
    and (
      profile.last_active_at is null
      or profile.last_active_at <= statement_timestamp() - interval '15 minutes'
    )
  returning profile.last_active_at into activity_time;

  if activity_time is null then
    select profile.last_active_at
    into activity_time
    from public.profiles as profile
    where profile.id = current_user_id;
  end if;

  return activity_time;
end;
$$;

create or replace function public.set_profile_role(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_role text
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  target_current_role text;
begin
  if p_role not in ('user', 'admin') then
    raise exception using errcode = '22023', message = 'Choose a valid role.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pokenotes-profile-role', 0)
  );

  if not exists (
    select 1
    from public.profiles as actor_profile
    where actor_profile.id = p_actor_user_id
      and actor_profile.role = 'admin'
  ) then
    raise exception using
      errcode = '42501',
      message = 'You do not have permission to update roles.';
  end if;

  select profile.role
  into target_current_role
  from public.profiles as profile
  where profile.id = p_target_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'User profile not found.';
  end if;

  if target_current_role = 'admin'
    and p_role = 'user'
    and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception using
      errcode = 'P0001',
      message = 'You cannot remove admin access from the only admin account.';
  end if;

  update public.profiles set role = p_role where id = p_target_user_id;
end;
$$;

revoke all on function public.sync_current_profile()
  from public, anon, authenticated;
grant execute on function public.sync_current_profile()
  to authenticated, service_role;

revoke all on function public.touch_current_profile_activity()
  from public, anon, authenticated;
grant execute on function public.touch_current_profile_activity()
  to authenticated, service_role;

revoke all on function public.set_profile_role(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.set_profile_role(uuid, uuid, text)
  to service_role;

revoke all on function public.get_admin_dashboard_overview()
  from public, anon, authenticated;
grant execute on function public.get_admin_dashboard_overview()
  to authenticated, service_role;

revoke all on function public.get_admin_users_overview()
  from public, anon, authenticated;
grant execute on function public.get_admin_users_overview()
  to authenticated, service_role;

-- Cache the caller identity once per statement instead of evaluating auth.uid()
-- for every candidate row. The ownership rules remain the same.
alter policy "Read public and own archetype catalog rows"
  on public.archetype_catalog
  using (source = 'curated' or (select auth.uid()) = user_id);

alter policy "Users can create learned archetype catalog rows"
  on public.archetype_catalog
  with check (source = 'learned' and (select auth.uid()) = user_id);

alter policy "Users can update learned archetype catalog rows"
  on public.archetype_catalog
  using (source = 'learned' and (select auth.uid()) = user_id)
  with check (source = 'learned' and (select auth.uid()) = user_id);

alter policy "Users can read own deck lists"
  on public.deck_lists
  using ((select auth.uid()) = user_id);

alter policy "Users can insert own deck lists"
  on public.deck_lists
  with check ((select auth.uid()) = user_id);

alter policy "Users can update own deck lists"
  on public.deck_lists
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users can delete own deck lists"
  on public.deck_lists
  using ((select auth.uid()) = user_id);

alter policy "Users can read own deck log stats"
  on public.deck_log_stats
  using ((select auth.uid()) = user_id);

alter policy "Users can read own deck matchups"
  on public.deck_matchups
  using ((select auth.uid()) = user_id);

alter policy "Users can insert own deck matchups"
  on public.deck_matchups
  with check ((select auth.uid()) = user_id);

alter policy "Users can update own deck matchups"
  on public.deck_matchups
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users can delete own deck matchups"
  on public.deck_matchups
  using ((select auth.uid()) = user_id);

alter policy "Users can read own decks"
  on public.decks
  using ((select auth.uid()) = user_id);

alter policy "Users can insert own decks"
  on public.decks
  with check ((select auth.uid()) = user_id);

alter policy "Users can update own decks"
  on public.decks
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users can delete own decks"
  on public.decks
  using ((select auth.uid()) = user_id);

alter policy "Users can read own logs"
  on public.logs
  using ((select auth.uid()) = user_id);

alter policy "Users can insert own logs"
  on public.logs
  with check ((select auth.uid()) = user_id);

alter policy "Users can update own logs"
  on public.logs
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users can delete own logs"
  on public.logs
  using ((select auth.uid()) = user_id);

alter policy "Admins can update role permissions"
  on public.role_permissions
  to authenticated
  using ((select private.is_current_user_admin()))
  with check ((select private.is_current_user_admin()));

alter policy "Users can read own route performance events"
  on public.route_performance_events
  to authenticated
  using (
    (select auth.uid()) = user_id
    or (select private.is_current_user_admin())
  );

alter policy "Users can insert own route performance events"
  on public.route_performance_events
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Admins can read route performance events"
  on public.route_performance_events;

alter policy "Users can read own tournament rounds"
  on public.tournament_rounds
  using ((select auth.uid()) = user_id);

alter policy "Users can insert own tournament rounds"
  on public.tournament_rounds
  with check ((select auth.uid()) = user_id);

alter policy "Users can update own tournament rounds"
  on public.tournament_rounds
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users can delete own tournament rounds"
  on public.tournament_rounds
  using ((select auth.uid()) = user_id);

alter policy "Users can read own tournaments"
  on public.tournaments
  using ((select auth.uid()) = user_id);

alter policy "Users can insert own tournaments"
  on public.tournaments
  with check ((select auth.uid()) = user_id);

alter policy "Users can update own tournaments"
  on public.tournaments
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users can delete own tournaments"
  on public.tournaments
  using ((select auth.uid()) = user_id);

alter policy "Users can read own archetype matchup stats"
  on public.user_archetype_matchup_stats
  using ((select auth.uid()) = user_id);

alter policy "Users can read own log stats"
  on public.user_log_stats
  using ((select auth.uid()) = user_id);

-- Postgres does not index the referencing side of a foreign key automatically.
-- These keep deck deletion and the corresponding joins from scanning full tables.
create index if not exists deck_lists_deck_id
  on public.deck_lists (deck_id);

create index if not exists deck_log_stats_deck_id
  on public.deck_log_stats (deck_id);

create index if not exists deck_matchups_deck_id
  on public.deck_matchups (deck_id);

create index if not exists logs_linked_deck_id
  on public.logs (linked_deck_id);

create index if not exists tournament_rounds_user_tournament
  on public.tournament_rounds (user_id, tournament_id);

create index if not exists tournaments_user_linked_deck
  on public.tournaments (user_id, linked_deck_id)
  where linked_deck_id is not null;

-- Keep trigger/event-trigger helpers out of the public API and pin their
-- namespace resolution so a future object cannot shadow built-in functions.
alter function public.set_updated_at()
  set search_path = pg_catalog;

alter function public.update_log_search_vector()
  set search_path = pg_catalog;

revoke all on function public.rls_auto_enable()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

-- The final bootstrap policies retain tenant-scoped deck/list validation after
-- the RLS performance alterations above.
alter policy "Users can insert own logs"
  on public.logs
  with check (
    (select auth.uid()) = user_id
    and (
      (linked_deck_id is null and linked_deck_list_id is null)
      or exists (
        select 1
        from public.decks as parent
        where parent.id = logs.linked_deck_id
          and parent.user_id = (select auth.uid())
          and (
            logs.linked_deck_list_id is null
            or exists (
              select 1
              from jsonb_array_elements(
                case
                  when jsonb_typeof(parent.deck_lists) = 'array'
                    then parent.deck_lists
                  else '[]'::jsonb
                end
              ) as item(value)
              where item.value ->> 'id' = logs.linked_deck_list_id
            )
          )
      )
    )
  );

alter policy "Users can update own logs"
  on public.logs
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      (linked_deck_id is null and linked_deck_list_id is null)
      or exists (
        select 1
        from public.decks as parent
        where parent.id = logs.linked_deck_id
          and parent.user_id = (select auth.uid())
          and (
            logs.linked_deck_list_id is null
            or exists (
              select 1
              from jsonb_array_elements(
                case
                  when jsonb_typeof(parent.deck_lists) = 'array'
                    then parent.deck_lists
                  else '[]'::jsonb
                end
              ) as item(value)
              where item.value ->> 'id' = logs.linked_deck_list_id
            )
          )
      )
    )
  );

alter policy "Users can insert own tournaments"
  on public.tournaments
  with check (
    (select auth.uid()) = user_id
    and (
      (linked_deck_id is null and linked_deck_list_id is null)
      or exists (
        select 1
        from public.decks as parent
        where parent.id = tournaments.linked_deck_id
          and parent.user_id = (select auth.uid())
          and (
            tournaments.linked_deck_list_id is null
            or exists (
              select 1
              from jsonb_array_elements(
                case
                  when jsonb_typeof(parent.deck_lists) = 'array'
                    then parent.deck_lists
                  else '[]'::jsonb
                end
              ) as item(value)
              where item.value ->> 'id' = tournaments.linked_deck_list_id
            )
          )
      )
    )
  );

alter policy "Users can update own tournaments"
  on public.tournaments
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      (linked_deck_id is null and linked_deck_list_id is null)
      or exists (
        select 1
        from public.decks as parent
        where parent.id = tournaments.linked_deck_id
          and parent.user_id = (select auth.uid())
          and (
            tournaments.linked_deck_list_id is null
            or exists (
              select 1
              from jsonb_array_elements(
                case
                  when jsonb_typeof(parent.deck_lists) = 'array'
                    then parent.deck_lists
                  else '[]'::jsonb
                end
              ) as item(value)
              where item.value ->> 'id' = tournaments.linked_deck_list_id
            )
          )
      )
    )
  );

notify pgrst, 'reload schema';
-- Final first-class Deck List state is defined by the migration-aligned RPCs below.

alter table public.deck_lists
  add column if not exists creation_key text;
alter table public.deck_lists
  alter column deck_id drop not null;
alter table public.deck_lists
  drop constraint if exists deck_lists_pkey;
alter table public.deck_lists
  add constraint deck_lists_pkey primary key (user_id, id);
create unique index if not exists deck_lists_user_creation_key_unique
  on public.deck_lists (user_id, creation_key)
  where creation_key is not null;
create index if not exists deck_lists_user_updated
  on public.deck_lists (user_id, updated_at desc, id);
comment on table public.deck_lists is
  'First-class account-owned Deck Lists. deck_id is an optional Deck Strategy association; the JSON copy remains active for ADR 0001 compatibility.';
comment on column public.deck_lists.deck_id is
  'Optional account-owned Deck Strategy association. Deleting the strategy clears this column without deleting the Deck List.';
comment on column public.deck_lists.creation_key is
  'Per-account idempotency identity for a deliberate Deck List creation. Legacy rows may remain null.';

alter table public.deck_lists
  drop constraint if exists deck_lists_owner_deck_fkey;
alter table public.deck_lists
  add constraint deck_lists_owner_deck_fkey
  foreign key (user_id, deck_id)
  references public.decks (user_id, id)
  on delete set null (deck_id)
  not valid;
alter table public.deck_lists
  validate constraint deck_lists_owner_deck_fkey;

alter table public.logs
  drop constraint if exists logs_linked_deck_list_requires_deck;
alter table public.tournaments
  drop constraint if exists tournaments_linked_deck_list_requires_deck;

create or replace function public.clear_orphaned_deck_list_link()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
  return new;
end;
$function$;

create or replace function public.remove_deleted_deck_list_legacy_copy()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
begin
  -- Lock order: Deck List then strategy. A direct delete already owns the
  -- list row before this trigger runs, so it follows the same order.
  update public.logs
  set linked_deck_list_id = null
  where user_id = old.user_id
    and linked_deck_list_id = old.id
    and (
      linked_deck_id is null
      or (old.deck_id is not null and linked_deck_id = old.deck_id)
    );
  update public.tournaments
  set linked_deck_list_id = null
  where user_id = old.user_id
    and linked_deck_list_id = old.id
    and (
      linked_deck_id is null
      or (old.deck_id is not null and linked_deck_id = old.deck_id)
    );
  if old.deck_id is not null then
    update public.decks as deck
    set deck_lists = coalesce(
      (
        select jsonb_agg(item.value order by item.ordinal)
        from jsonb_array_elements(
          case when jsonb_typeof(deck.deck_lists) = 'array' then deck.deck_lists else '[]'::jsonb end
        ) with ordinality as item(value, ordinal)
        where item.value ->> 'id' <> old.id
      ),
      '[]'::jsonb
    ),
    updated_at = now()
    where deck.user_id = old.user_id and deck.id = old.deck_id;
  end if;
  return old;
end;
$function$;
revoke all on function public.remove_deleted_deck_list_legacy_copy()
  from public, anon, authenticated;
drop trigger if exists remove_deleted_deck_list_legacy_copy on public.deck_lists;
create trigger remove_deleted_deck_list_legacy_copy
  before delete on public.deck_lists
  for each row execute function public.remove_deleted_deck_list_legacy_copy();

create or replace function public.can_use_deck_list_reference(
  p_user_id uuid,
  p_deck_id text,
  p_deck_list_id text
)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select case
    when p_deck_id is null and p_deck_list_id is null then true
    when p_deck_id is not null and not exists (
      select 1 from public.decks as deck
      where deck.user_id = p_user_id and deck.id = p_deck_id
    ) then false
    when p_deck_list_id is null then true
    when p_deck_id is null and exists (
      select 1 from public.deck_lists as deck_list
      where deck_list.user_id = p_user_id and deck_list.id = p_deck_list_id
    ) then true
    when p_deck_id is not null and exists (
      select 1 from public.deck_lists as deck_list
      where deck_list.user_id = p_user_id and deck_list.id = p_deck_list_id
        and deck_list.deck_id = p_deck_id
    ) then true
    when p_deck_id is not null and exists (
      select 1 from public.decks as deck
      where deck.user_id = p_user_id and deck.id = p_deck_id
        and jsonb_typeof(deck.deck_lists) = 'array'
        and exists (
          select 1 from jsonb_array_elements(deck.deck_lists) as item(value)
          where item.value ->> 'id' = p_deck_list_id
        )
    ) then true
    else false
  end;
$function$;
revoke all on function public.can_use_deck_list_reference(uuid, text, text)
  from public, anon;
grant execute on function public.can_use_deck_list_reference(uuid, text, text)
  to authenticated;

alter policy "Users can insert own logs"
  on public.logs
  with check (
    (select auth.uid()) = user_id
    and (select public.can_use_deck_list_reference(user_id, linked_deck_id, linked_deck_list_id))
  );
alter policy "Users can update own logs"
  on public.logs
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (select public.can_use_deck_list_reference(user_id, linked_deck_id, linked_deck_list_id))
  );
alter policy "Users can insert own tournaments"
  on public.tournaments
  with check (
    (select auth.uid()) = user_id
    and (select public.can_use_deck_list_reference(user_id, linked_deck_id, linked_deck_list_id))
  );
alter policy "Users can update own tournaments"
  on public.tournaments
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (select public.can_use_deck_list_reference(user_id, linked_deck_id, linked_deck_list_id))
  );

alter function public.commit_deck_aggregate_child(
  text, text, text, jsonb, text, timestamptz
) rename to commit_deck_aggregate_child_legacy_parent_first;

alter function public.commit_deck_aggregate_child_legacy_parent_first(
  text, text, text, jsonb, text, timestamptz
) security definer;
alter function public.commit_deck_aggregate_child_legacy_parent_first(
  text, text, text, jsonb, text, timestamptz
) set search_path = pg_catalog, public;
revoke all on function public.commit_deck_aggregate_child_legacy_parent_first(
  text, text, text, jsonb, text, timestamptz
) from public, anon, authenticated;

create or replace function public.commit_deck_aggregate_child(
  p_deck_id text,
  p_kind text,
  p_operation text,
  p_child jsonb,
  p_expected_child_updated_at text,
  p_updated_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_child_id text := nullif(btrim(p_child ->> 'id'), '');
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if p_kind = 'deck-list' and v_child_id is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(v_user_id::text || ':deck-list-mutations', 0)
    );
    perform pg_advisory_xact_lock(
      hashtextextended(v_user_id::text || ':deck-list:' || p_operation || ':' || v_child_id, 0)
    );
    perform 1 from public.deck_lists
    where user_id = v_user_id and id = v_child_id
    for update;
  end if;
  return public.commit_deck_aggregate_child_legacy_parent_first(
    p_deck_id, p_kind, p_operation, p_child, p_expected_child_updated_at, p_updated_at
  );
end;
$function$;
revoke all on function public.commit_deck_aggregate_child(
  text, text, text, jsonb, text, timestamptz
) from public, anon;
grant execute on function public.commit_deck_aggregate_child(
  text, text, text, jsonb, text, timestamptz
) to authenticated;

create or replace function public.commit_first_class_deck_list(
  p_deck_id text,
  p_operation text,
  p_payload jsonb,
  p_creation_key text,
  p_expected_updated_at timestamptz,
  p_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_deck_id text := nullif(btrim(p_deck_id), '');
  v_creation_key text := nullif(btrim(p_creation_key), '');
  v_list_id text;
  v_position integer;
  v_existing public.deck_lists%rowtype;
  v_inserted public.deck_lists%rowtype;
  v_current public.deck_lists%rowtype;
  v_legacy_children jsonb;
  v_next_children jsonb;
  v_requested_fingerprint jsonb;
  v_existing_fingerprint jsonb;
  v_legacy_match_count integer := 0;
  v_migrated_legacy boolean := false;
  v_target_id text;
  v_legacy_item jsonb;
  v_legacy_updated_at timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':deck-list-mutations', 0)
  );
  if p_operation not in ('create', 'update') then
    raise exception using errcode = '22023', message = 'Unsupported Deck List operation.';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Deck List payload must be an object.';
  end if;

  v_list_id := nullif(btrim(p_payload ->> 'id'), '');
  if v_list_id is null then
    raise exception using errcode = '22023', message = 'Deck List id is required.';
  end if;
  if nullif(btrim(coalesce(p_payload ->> 'name', '')), '') is null then
    raise exception using errcode = '22023', message = 'Deck List name is required.';
  end if;
  if nullif(btrim(coalesce(p_payload ->> 'rawList', p_payload ->> 'raw_list', '')), '') is null then
    raise exception using errcode = '22023', message = 'Deck List text is required.';
  end if;
  if jsonb_typeof(coalesce(p_payload -> 'parsedCards', p_payload -> 'parsed_cards')) is distinct from 'array'
    or jsonb_typeof(coalesce(p_payload -> 'sortedCards', p_payload -> 'sorted_cards')) is distinct from 'array'
    or jsonb_typeof(coalesce(p_payload -> 'sortedCardsVersion', p_payload -> 'sorted_cards_version')) is distinct from 'number'
  then
    raise exception using errcode = '22023', message = 'Deck List card data is invalid.';
  end if;
  if p_updated_at is null then
    raise exception using errcode = '22023', message = 'An update timestamp is required.';
  end if;

  if p_operation = 'create' then
    if v_creation_key is null then
      raise exception using errcode = '22023', message = 'A Deck List creation key is required.';
    end if;
    if v_list_id is distinct from v_creation_key then
      raise exception using errcode = '22023', message = 'Deck List id must equal its creation key.';
    end if;
    perform pg_advisory_xact_lock(
      hashtextextended(v_user_id::text || ':deck-list:create:' || v_creation_key, 0)
    );
    if v_deck_id is not null then
      perform 1 from public.decks
      where user_id = v_user_id and id = v_deck_id
      for update;
      if not found then
        raise exception using errcode = '42501', message = 'Deck Strategy could not be found.';
      end if;
    end if;
    select * into v_existing
    from public.deck_lists
    where user_id = v_user_id and creation_key = v_creation_key
    for update;

    v_requested_fingerprint := jsonb_build_object(
      'deck_id', v_deck_id,
      'name', btrim(p_payload ->> 'name'),
      'format', coalesce(p_payload ->> 'format', ''),
      'date', coalesce(p_payload ->> 'date', ''),
      'created_by', coalesce(p_payload ->> 'createdBy', p_payload ->> 'created_by', ''),
      'notes', coalesce(p_payload ->> 'notes', ''),
      'raw_list', coalesce(p_payload ->> 'rawList', p_payload ->> 'raw_list', ''),
      'parsed_cards', coalesce(p_payload -> 'parsedCards', p_payload -> 'parsed_cards'),
      'sorted_cards', coalesce(p_payload -> 'sortedCards', p_payload -> 'sorted_cards'),
      'sorted_cards_version', coalesce(p_payload -> 'sortedCardsVersion', p_payload -> 'sorted_cards_version')
    );
    if found then
      v_existing_fingerprint := jsonb_build_object(
        'deck_id', v_existing.deck_id,
        'name', v_existing.name,
        'format', v_existing.format,
        'date', v_existing.date,
        'created_by', v_existing.created_by,
        'notes', v_existing.notes,
        'raw_list', v_existing.raw_list,
        'parsed_cards', v_existing.parsed_cards,
        'sorted_cards', v_existing.sorted_cards,
        'sorted_cards_version', v_existing.sorted_cards_version
      );
      if v_existing_fingerprint = v_requested_fingerprint then
        return jsonb_build_object('status', 'idempotent', 'deckList', to_jsonb(v_existing));
      end if;
      raise exception using errcode = '23505', message = 'Conflicting idempotency key for Deck List creation.';
    end if;

    -- A new first-class identity may not shadow any same-account legacy copy.
    -- Cross-account copies are intentionally allowed because this scan is
    -- explicitly tenant-scoped.
    select count(*)
    into v_legacy_match_count
    from public.decks as deck
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(deck.deck_lists) = 'array' then deck.deck_lists else '[]'::jsonb end
    ) as item(value)
    where deck.user_id = v_user_id
      and item.value ->> 'id' = v_list_id;

    if v_legacy_match_count > 0 then
      raise exception using
        errcode = '23505',
        message = 'Deck List id is already represented by a legacy Deck List.';
    end if;

    if exists (
      select 1 from public.deck_lists
      where user_id = v_user_id and id = v_list_id
    ) then
      raise exception using errcode = '23505', message = 'Deck List id is already in use.';
    end if;

    select coalesce(min(position) - 1, 0)
    into v_position
    from public.deck_lists
    where user_id = v_user_id
      and deck_id is not distinct from v_deck_id;

    insert into public.deck_lists (
      id, deck_id, user_id, creation_key, name, format, date, created_by,
      notes, raw_list, parsed_cards, sorted_cards, sorted_cards_version,
      position, created_at, updated_at
    ) values (
      v_list_id, v_deck_id, v_user_id, v_creation_key,
      btrim(p_payload ->> 'name'),
      coalesce(p_payload ->> 'format', ''),
      coalesce(p_payload ->> 'date', ''),
      coalesce(p_payload ->> 'createdBy', p_payload ->> 'created_by', ''),
      coalesce(p_payload ->> 'notes', ''),
      coalesce(p_payload ->> 'rawList', p_payload ->> 'raw_list', ''),
      coalesce(p_payload -> 'parsedCards', p_payload -> 'parsed_cards'),
      coalesce(p_payload -> 'sortedCards', p_payload -> 'sorted_cards'),
      coalesce((p_payload ->> 'sortedCardsVersion')::integer, (p_payload ->> 'sorted_cards_version')::integer),
      v_position,
      coalesce(nullif(p_payload ->> 'createdAt', '')::timestamptz, p_updated_at),
      p_updated_at
    ) returning * into v_inserted;
    v_current := v_inserted;
  else
    perform pg_advisory_xact_lock(
      hashtextextended(v_user_id::text || ':deck-list:update:' || v_list_id, 0)
    );
    select * into v_current
    from public.deck_lists
    where user_id = v_user_id and id = v_list_id
    for update;
    if not found and v_deck_id is not null then
      declare
        v_legacy_item jsonb;
        v_legacy_updated_at timestamptz;
        v_legacy_source_deck_id text;
      begin
        select count(*)
        into v_legacy_match_count
        from public.decks as deck
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(deck.deck_lists) = 'array' then deck.deck_lists else '[]'::jsonb end
        ) as item(value)
        where deck.user_id = v_user_id
          and item.value ->> 'id' = v_list_id;
        if v_legacy_match_count = 0 then
          raise exception using errcode = 'P0002', message = 'Deck List could not be found.';
        elsif v_legacy_match_count > 1 then
          raise exception using
            errcode = 'P0002',
            message = 'Deck List identity is ambiguous across this account; choose one legacy source.';
        end if;
        v_legacy_source_deck_id := nullif(btrim(p_payload ->> '_legacySourceDeckId'), '');
        if v_legacy_source_deck_id is distinct from v_deck_id then
          raise exception using
            errcode = 'P0002',
            message = 'Legacy Deck List adoption requires its exact owned source.';
        end if;
        select deck_lists into v_legacy_children from public.decks
        where user_id = v_user_id and id = v_deck_id for update;
        if not found then
          raise exception using errcode = '42501', message = 'Deck Strategy could not be found.';
        end if;
        select item.value into v_legacy_item
        from jsonb_array_elements(
          case when jsonb_typeof(v_legacy_children) = 'array' then v_legacy_children else '[]'::jsonb end
        ) as item(value)
        where item.value ->> 'id' = v_list_id;
        if not found then
          raise exception using errcode = 'P0002', message = 'Deck List could not be found.';
        end if;
        v_legacy_updated_at := nullif(coalesce(v_legacy_item ->> 'updatedAt', v_legacy_item ->> 'updated_at'), '')::timestamptz;
        if p_expected_updated_at is null
          or (v_legacy_updated_at is not null and v_legacy_updated_at is distinct from p_expected_updated_at)
          or (v_legacy_updated_at is not null and p_updated_at <= v_legacy_updated_at)
        then
          raise exception using errcode = 'P0001', message = 'Deck List changed; refresh-and-retry before saving.';
        end if;

        select coalesce(min(position) - 1, 0)
        into v_position
        from public.deck_lists
        where user_id = v_user_id
          and deck_id is not distinct from v_deck_id;

        insert into public.deck_lists (
          id, deck_id, user_id, creation_key, name, format, date, created_by,
          notes, raw_list, parsed_cards, sorted_cards, sorted_cards_version,
          position, created_at, updated_at
        ) values (
          v_list_id, v_deck_id, v_user_id, null,
          btrim(p_payload ->> 'name'), coalesce(p_payload ->> 'format', ''),
          coalesce(p_payload ->> 'date', ''), coalesce(p_payload ->> 'createdBy', p_payload ->> 'created_by', ''),
          coalesce(p_payload ->> 'notes', ''), coalesce(p_payload ->> 'rawList', p_payload ->> 'raw_list', ''),
          coalesce(p_payload -> 'parsedCards', p_payload -> 'parsed_cards'),
          coalesce(p_payload -> 'sortedCards', p_payload -> 'sorted_cards'),
          coalesce((p_payload ->> 'sortedCardsVersion')::integer, (p_payload ->> 'sorted_cards_version')::integer),
          v_position, coalesce(nullif(coalesce(p_payload ->> 'createdAt', p_payload ->> 'created_at'), '')::timestamptz, p_updated_at),
          p_updated_at
        ) returning * into v_current;
        v_migrated_legacy := true;
      end;
    elsif not found then
      raise exception using errcode = 'P0002', message = 'Deck List could not be found.';
    end if;
    if v_current.id is not null and v_current.deck_id is distinct from v_deck_id then
      if v_deck_id is null
        or nullif(btrim(p_payload ->> '_legacySourceDeckId'), '') is distinct from v_deck_id
      then
        raise exception using errcode = 'P0001', message = 'Deck List association changed; refresh-and-retry before saving.';
      end if;

      -- Re-key the exact legacy source instead of mutating the other
      -- relational row that owns the same account-scoped ID.
      select count(*) into v_legacy_match_count
      from public.decks as deck
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(deck.deck_lists) = 'array' then deck.deck_lists else '[]'::jsonb end
      ) as item(value)
      where deck.user_id = v_user_id
        and item.value ->> 'id' = v_list_id
        and not (
          v_current.deck_id is not null
          and deck.id = v_current.deck_id
          and item.value ->> 'id' = v_current.id
        );
      if v_legacy_match_count <> 1 then
        raise exception using errcode = 'P0002', message = 'Deck List identity is ambiguous across this account; choose one legacy source.';
      end if;

      select deck_lists into v_legacy_children from public.decks
      where user_id = v_user_id and id = v_deck_id for update;
      if not found then
        raise exception using errcode = '42501', message = 'Deck Strategy could not be found.';
      end if;
      select item.value into v_legacy_item
      from jsonb_array_elements(
        case when jsonb_typeof(v_legacy_children) = 'array' then v_legacy_children else '[]'::jsonb end
      ) as item(value)
      where item.value ->> 'id' = v_list_id;
      if not found then
        raise exception using errcode = 'P0002', message = 'Deck List could not be found.';
      end if;
      v_legacy_updated_at := nullif(coalesce(v_legacy_item ->> 'updatedAt', v_legacy_item ->> 'updated_at'), '')::timestamptz;
      if p_expected_updated_at is null
        or (v_legacy_updated_at is not null and v_legacy_updated_at is distinct from p_expected_updated_at)
        or (v_legacy_updated_at is not null and p_updated_at <= v_legacy_updated_at)
      then
        raise exception using errcode = 'P0001', message = 'Deck List changed; refresh-and-retry before saving.';
      end if;

      v_target_id := gen_random_uuid()::text;
      select coalesce(min(position) - 1, 0) into v_position
      from public.deck_lists
      where user_id = v_user_id and deck_id is not distinct from v_deck_id;
      insert into public.deck_lists (
        id, deck_id, user_id, creation_key, name, format, date, created_by,
        notes, raw_list, parsed_cards, sorted_cards, sorted_cards_version,
        position, created_at, updated_at
      ) values (
        v_target_id, v_deck_id, v_user_id, null,
        btrim(p_payload ->> 'name'), coalesce(p_payload ->> 'format', ''),
        coalesce(p_payload ->> 'date', ''), coalesce(p_payload ->> 'createdBy', p_payload ->> 'created_by', ''),
        coalesce(p_payload ->> 'notes', ''), coalesce(p_payload ->> 'rawList', p_payload ->> 'raw_list', ''),
        coalesce(p_payload -> 'parsedCards', p_payload -> 'parsed_cards'),
        coalesce(p_payload -> 'sortedCards', p_payload -> 'sorted_cards'),
        coalesce((p_payload ->> 'sortedCardsVersion')::integer, (p_payload ->> 'sorted_cards_version')::integer),
        v_position,
        coalesce(nullif(coalesce(p_payload ->> 'createdAt', p_payload ->> 'created_at'), '')::timestamptz, v_legacy_updated_at, p_updated_at),
        p_updated_at
      ) returning * into v_current;
      update public.logs set linked_deck_list_id = v_target_id
      where user_id = v_user_id and linked_deck_id = v_deck_id and linked_deck_list_id = v_list_id;
      update public.tournaments set linked_deck_list_id = v_target_id
      where user_id = v_user_id and linked_deck_id = v_deck_id and linked_deck_list_id = v_list_id;
      select coalesce(jsonb_agg(
        case when item.value ->> 'id' = v_list_id then jsonb_build_object(
          'id', v_current.id, 'name', v_current.name, 'format', v_current.format,
          'date', v_current.date, 'createdBy', v_current.created_by, 'notes', v_current.notes,
          'rawList', v_current.raw_list, 'parsedCards', v_current.parsed_cards,
          'sortedCards', v_current.sorted_cards, 'sortedCardsVersion', v_current.sorted_cards_version,
          'createdAt', v_current.created_at, 'updatedAt', v_current.updated_at
        ) else item.value end order by item.ordinal
      ), '[]'::jsonb) into v_next_children
      from jsonb_array_elements(v_legacy_children) with ordinality as item(value, ordinal);
      update public.decks set deck_lists = v_next_children, updated_at = p_updated_at
      where user_id = v_user_id and id = v_deck_id;
      v_migrated_legacy := true;
    end if;

    if not v_migrated_legacy then
      select count(*) into v_legacy_match_count
      from public.decks as deck
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(deck.deck_lists) = 'array' then deck.deck_lists else '[]'::jsonb end
      ) as item(value)
      where deck.user_id = v_user_id
        and item.value ->> 'id' = v_current.id
        and not (
          v_current.deck_id is not null
          and deck.id = v_current.deck_id
          and item.value ->> 'id' = v_current.id
        );
      if v_legacy_match_count > 1 then
        raise exception using errcode = 'P0002', message = 'Deck List identity is ambiguous across this account; no compatibility copy was changed.';
      end if;
      if v_legacy_match_count = 1 and (
        v_current.deck_id is null
        or not exists (
          select 1 from public.decks as deck
          cross join lateral jsonb_array_elements(
            case when jsonb_typeof(deck.deck_lists) = 'array' then deck.deck_lists else '[]'::jsonb end
          ) as item(value)
          where deck.user_id = v_user_id and deck.id = v_current.deck_id and item.value ->> 'id' = v_current.id
        )
      ) then
        raise exception using errcode = 'P0002', message = 'Deck List compatibility copy does not match its owned strategy.';
      end if;
      if p_expected_updated_at is null
        or v_current.updated_at is distinct from p_expected_updated_at
        or p_updated_at <= v_current.updated_at
      then
        raise exception using errcode = 'P0001', message = 'Deck List changed; refresh-and-retry before saving.';
      end if;
      update public.deck_lists
      set name = btrim(p_payload ->> 'name'),
        format = coalesce(p_payload ->> 'format', ''),
        date = coalesce(p_payload ->> 'date', ''),
        created_by = coalesce(p_payload ->> 'createdBy', p_payload ->> 'created_by', ''),
        notes = coalesce(p_payload ->> 'notes', ''),
        raw_list = coalesce(p_payload ->> 'rawList', p_payload ->> 'raw_list', ''),
        parsed_cards = coalesce(p_payload -> 'parsedCards', p_payload -> 'parsed_cards'),
        sorted_cards = coalesce(p_payload -> 'sortedCards', p_payload -> 'sorted_cards'),
        sorted_cards_version = coalesce((p_payload ->> 'sortedCardsVersion')::integer, (p_payload ->> 'sorted_cards_version')::integer),
        updated_at = p_updated_at
      where user_id = v_user_id and id = v_list_id returning * into v_current;
    end if;
    if v_deck_id is not null then
      perform 1 from public.decks
      where user_id = v_user_id and id = v_deck_id for update;
      if not found then
        raise exception using errcode = '42501', message = 'Deck Strategy could not be found.';
      end if;
    end if;
  end if;

  if v_current.deck_id is not null then
    select deck_lists into v_legacy_children
    from public.decks
    where user_id = v_user_id and id = v_current.deck_id
    for update;
    if jsonb_typeof(v_legacy_children) is distinct from 'array' then
      v_legacy_children := '[]'::jsonb;
    end if;
    select coalesce(jsonb_agg(
      case when item.value ->> 'id' = v_current.id then jsonb_build_object(
        'id', v_current.id, 'name', v_current.name, 'format', v_current.format,
        'date', v_current.date, 'createdBy', v_current.created_by,
        'notes', v_current.notes, 'rawList', v_current.raw_list,
        'parsedCards', v_current.parsed_cards, 'sortedCards', v_current.sorted_cards,
        'sortedCardsVersion', v_current.sorted_cards_version,
        'createdAt', v_current.created_at, 'updatedAt', v_current.updated_at
      ) else item.value end order by item.ordinal
    ), '[]'::jsonb) into v_next_children
    from jsonb_array_elements(v_legacy_children) with ordinality as item(value, ordinal);
    if not exists (
      select 1 from jsonb_array_elements(v_legacy_children) as item(value)
      where item.value ->> 'id' = v_current.id
    ) then
      v_next_children := jsonb_build_array(jsonb_build_object(
        'id', v_current.id, 'name', v_current.name, 'format', v_current.format,
        'date', v_current.date, 'createdBy', v_current.created_by,
        'notes', v_current.notes, 'rawList', v_current.raw_list,
        'parsedCards', v_current.parsed_cards, 'sortedCards', v_current.sorted_cards,
        'sortedCardsVersion', v_current.sorted_cards_version,
        'createdAt', v_current.created_at, 'updatedAt', v_current.updated_at
      )) || v_next_children;
    end if;
    update public.decks
    set deck_lists = v_next_children, updated_at = p_updated_at
    where user_id = v_user_id and id = v_current.deck_id;
  end if;
  return jsonb_build_object('status', 'committed', 'deckList', to_jsonb(v_current));
end;
$function$;

revoke all on function public.commit_first_class_deck_list(text, text, jsonb, text, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.commit_first_class_deck_list(text, text, jsonb, text, timestamptz, timestamptz)
  to authenticated;

create or replace function public.set_deck_list_association(
  p_deck_list_id text,
  p_deck_id text,
  p_expected_updated_at timestamptz,
  p_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_new_deck_id text := nullif(btrim(p_deck_id), '');
  v_list public.deck_lists%rowtype;
  v_old_deck_id text;
  v_deck_lists jsonb;
  v_list_json jsonb;
  v_new_position integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if p_updated_at is null or p_expected_updated_at is null then
    raise exception using errcode = '22023', message = 'Association version is required.';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':deck-list-mutations', 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':deck-list:update:' || p_deck_list_id, 0)
  );
  select * into v_list from public.deck_lists
  where user_id = v_user_id and id = p_deck_list_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Deck List could not be found.';
  end if;
  if v_list.updated_at is distinct from p_expected_updated_at or p_updated_at <= v_list.updated_at then
    raise exception using errcode = 'P0001', message = 'Deck List changed; refresh-and-retry before changing its association.';
  end if;
  v_old_deck_id := v_list.deck_id;
  if v_old_deck_id is not distinct from v_new_deck_id then
    return jsonb_build_object('status', 'committed', 'deckList', to_jsonb(v_list));
  end if;
  perform 1
  from public.decks
  where user_id = v_user_id
    and id in (v_old_deck_id, v_new_deck_id)
  order by id
  for update;
  if v_new_deck_id is not null
    and not exists (
      select 1 from public.decks
      where user_id = v_user_id and id = v_new_deck_id
    )
  then
    raise exception using errcode = '42501', message = 'Deck Strategy could not be found.';
  end if;

  select coalesce(min(position) - 1, 0)
  into v_new_position
  from public.deck_lists
  where user_id = v_user_id
    and deck_id is not distinct from v_new_deck_id
    and id <> v_list.id;
  if v_old_deck_id is not null then
    update public.decks as deck
    set deck_lists = coalesce(
      (select jsonb_agg(item.value order by item.ordinal)
       from jsonb_array_elements(
         case when jsonb_typeof(deck.deck_lists) = 'array' then deck.deck_lists else '[]'::jsonb end
       ) with ordinality as item(value, ordinal)
       where item.value ->> 'id' <> v_list.id),
      '[]'::jsonb
    ), updated_at = p_updated_at
    where deck.user_id = v_user_id and deck.id = v_old_deck_id;
  end if;
  update public.deck_lists
  set deck_id = v_new_deck_id, position = v_new_position, updated_at = p_updated_at
  where user_id = v_user_id and id = v_list.id;
  if v_new_deck_id is not null then
    v_list_json := jsonb_build_object(
      'id', v_list.id, 'name', v_list.name, 'format', v_list.format,
      'date', v_list.date, 'createdBy', v_list.created_by, 'notes', v_list.notes,
      'rawList', v_list.raw_list, 'parsedCards', v_list.parsed_cards,
      'sortedCards', v_list.sorted_cards, 'sortedCardsVersion', v_list.sorted_cards_version,
      'createdAt', v_list.created_at, 'updatedAt', p_updated_at
    );
    select deck_lists into v_deck_lists from public.decks
    where user_id = v_user_id and id = v_new_deck_id for update;
    if exists (
      select 1 from jsonb_array_elements(coalesce(v_deck_lists, '[]'::jsonb)) as item(value)
      where item.value ->> 'id' = v_list.id
    ) then
      raise exception using errcode = '23505', message = 'Deck List association conflicts with an existing compatibility copy.';
    end if;
    update public.decks
    set deck_lists = jsonb_build_array(v_list_json) ||
      case when jsonb_typeof(v_deck_lists) = 'array' then v_deck_lists else '[]'::jsonb end,
      updated_at = p_updated_at
    where user_id = v_user_id and id = v_new_deck_id;
  end if;
  select * into v_list from public.deck_lists
  where user_id = v_user_id and id = v_list.id;
  return jsonb_build_object('status', 'committed', 'deckList', to_jsonb(v_list));
end;
$function$;

revoke all on function public.set_deck_list_association(text, text, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.set_deck_list_association(text, text, timestamptz, timestamptz)
  to authenticated;

create or replace function public.preserve_deleted_deck_legacy_references(
  p_user_id uuid,
  p_deck_id text,
  p_deck_lists jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_item jsonb;
  v_list_id text;
  v_target_id text;
  v_legacy_count integer;
  v_existing public.deck_lists%rowtype;
  v_has_existing boolean;
begin
  if jsonb_typeof(p_deck_lists) is distinct from 'array' then
    return;
  end if;
  for v_item in
    select item.value from jsonb_array_elements(p_deck_lists) as item(value)
  loop
    v_list_id := nullif(btrim(v_item ->> 'id'), '');
    if v_list_id is null then continue; end if;
    select count(*) into v_legacy_count
    from jsonb_array_elements(p_deck_lists) as item(value)
    where item.value ->> 'id' = v_list_id;
    if v_legacy_count > 1 then
      update public.logs set linked_deck_id = null, linked_deck_list_id = null
      where user_id = p_user_id and linked_deck_id = p_deck_id
        and linked_deck_list_id = v_list_id;
      update public.tournaments set linked_deck_id = null, linked_deck_list_id = null
      where user_id = p_user_id and linked_deck_id = p_deck_id
        and linked_deck_list_id = v_list_id;
      continue;
    end if;
    v_existing := null;
    select * into v_existing from public.deck_lists
    where user_id = p_user_id and id = v_list_id for update;
    v_has_existing := found;
    if v_has_existing and v_existing.deck_id is not distinct from p_deck_id then
      v_target_id := v_list_id;
    else
      v_target_id := case when v_has_existing then gen_random_uuid()::text else v_list_id end;
      insert into public.deck_lists (
        user_id, id, deck_id, creation_key, name, format, date, created_by,
        notes, raw_list, parsed_cards, sorted_cards, sorted_cards_version,
        position, created_at, updated_at
      ) values (
        p_user_id, v_target_id, null, null,
        coalesce(v_item ->> 'name', ''),
        coalesce(v_item ->> 'format', ''),
        coalesce(v_item ->> 'date', ''),
        coalesce(v_item ->> 'createdBy', v_item ->> 'created_by', ''),
        coalesce(v_item ->> 'notes', ''),
        coalesce(v_item -> 'rawList', v_item -> 'raw_list', ''),
        coalesce(v_item -> 'parsedCards', v_item -> 'parsed_cards', '[]'::jsonb),
        coalesce(v_item -> 'sortedCards', v_item -> 'sorted_cards', '[]'::jsonb),
        case when coalesce(v_item ->> 'sortedCardsVersion', v_item ->> 'sorted_cards_version') ~ '^[0-9]+$'
          then coalesce(v_item ->> 'sortedCardsVersion', v_item ->> 'sorted_cards_version')::integer
          else null end,
        0,
        coalesce(nullif(coalesce(v_item ->> 'createdAt', v_item ->> 'created_at'), '')::timestamptz, now()),
        now()
      );
    end if;
    update public.logs set linked_deck_id = null, linked_deck_list_id = v_target_id
    where user_id = p_user_id and linked_deck_id = p_deck_id
      and linked_deck_list_id = v_list_id;
    update public.tournaments set linked_deck_id = null, linked_deck_list_id = v_target_id
    where user_id = p_user_id and linked_deck_id = p_deck_id
      and linked_deck_list_id = v_list_id;
  end loop;
  update public.logs as log
  set linked_deck_id = null
  where log.user_id = p_user_id
    and log.linked_deck_id = p_deck_id
    and exists (
      select 1 from public.deck_lists as deck_list
      where deck_list.user_id = p_user_id
        and deck_list.id = log.linked_deck_list_id
        and deck_list.deck_id = p_deck_id
    );
  update public.tournaments as tournament
  set linked_deck_id = null
  where tournament.user_id = p_user_id
    and tournament.linked_deck_id = p_deck_id
    and exists (
      select 1 from public.deck_lists as deck_list
      where deck_list.user_id = p_user_id
        and deck_list.id = tournament.linked_deck_list_id
        and deck_list.deck_id = p_deck_id
    );
  update public.logs
  set linked_deck_id = null, linked_deck_list_id = null
  where user_id = p_user_id and linked_deck_id = p_deck_id;
  update public.tournaments
  set linked_deck_id = null, linked_deck_list_id = null
  where user_id = p_user_id and linked_deck_id = p_deck_id;
end;
$function$;
revoke all on function public.preserve_deleted_deck_legacy_references(uuid, text, jsonb)
  from public, anon, authenticated;

create or replace function public.delete_owned_deck(
  p_deck_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_deck_id text := nullif(btrim(p_deck_id), '');
  v_deleted_id text;
  v_legacy_children jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if v_deck_id is null then
    raise exception using errcode = '22023', message = 'Deck id is required.';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':deck-list-mutations', 0)
  );
  select id, deck_lists into v_deleted_id, v_legacy_children
  from public.decks
  where user_id = v_user_id and id = v_deck_id
  for update;
  if not found then
    return null;
  end if;
  perform public.preserve_deleted_deck_legacy_references(v_user_id, v_deck_id, v_legacy_children);
  delete from public.decks
  where user_id = v_user_id and id = v_deck_id;
  return jsonb_build_object('id', v_deleted_id);
end;
$function$;
revoke all on function public.delete_owned_deck(text) from public, anon;
grant execute on function public.delete_owned_deck(text) to authenticated;
revoke delete on table public.decks from public, anon, authenticated;

create or replace function public.delete_first_class_deck_list(
  p_deck_list_id text,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_list public.deck_lists%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':deck-list-mutations', 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':deck-list:update:' || p_deck_list_id, 0)
  );
  select * into v_list from public.deck_lists
  where user_id = v_user_id and id = p_deck_list_id
  for update;
  if not found then
    return jsonb_build_object('status', 'not-found');
  end if;
  if p_expected_updated_at is null or v_list.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'Deck List changed; refresh-and-retry before deleting.';
  end if;
  delete from public.deck_lists
  where user_id = v_user_id and id = p_deck_list_id;
  return jsonb_build_object('status', 'committed', 'deckListId', p_deck_list_id);
end;
$function$;
revoke all on function public.delete_first_class_deck_list(text, timestamptz)
  from public, anon;
grant execute on function public.delete_first_class_deck_list(text, timestamptz)
  to authenticated;

create or replace function public.get_initial_logs_page_data(p_limit integer default 51)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  with request_context as (
    select (select auth.uid()) as user_id
  ),
  stats as (
    select
      coalesce(user_log_stats.games_played, 0) as games_played,
      coalesce(user_log_stats.games_won, 0) as games_won,
      coalesce(user_log_stats.games_lost, 0) as games_lost
    from request_context
    left join public.user_log_stats
      on user_log_stats.user_id = request_context.user_id
  ),
  ordered_logs as (
    select logs.id, logs.date, logs.result, logs.format, logs.go_order,
      logs.self_player_name, logs.self_deck_name, logs.self_deck_sprites,
      logs.opponent_player_name, logs.opponent_deck_name, logs.opponent_deck_sprites,
      logs.total_turns, logs.linked_deck_id, logs.linked_deck_list_id,
      logs.imported_at, logs.user_id
    from public.logs
    cross join request_context
    where logs.user_id = request_context.user_id
    order by logs.date desc, logs.imported_at desc, logs.id desc
    limit greatest(1, least(coalesce(p_limit, 51), 101))
  ),
  enriched_logs as (
    select ordered_logs.id, ordered_logs.date, ordered_logs.result, ordered_logs.format,
      ordered_logs.go_order, ordered_logs.self_player_name, ordered_logs.self_deck_name,
      ordered_logs.self_deck_sprites, ordered_logs.opponent_player_name,
      ordered_logs.opponent_deck_name, ordered_logs.opponent_deck_sprites,
      ordered_logs.total_turns, ordered_logs.linked_deck_id,
      ordered_logs.linked_deck_list_id, ordered_logs.imported_at,
      coalesce(relational_list.name, aggregate_list.name) as linked_deck_list_name
    from ordered_logs
    left join public.deck_lists as relational_list
      on relational_list.user_id = ordered_logs.user_id
      and relational_list.id = ordered_logs.linked_deck_list_id
      and (
        ordered_logs.linked_deck_id is null
        or relational_list.deck_id = ordered_logs.linked_deck_id
      )
    left join public.decks
      on relational_list.id is null
      and decks.user_id = ordered_logs.user_id
      and decks.id = ordered_logs.linked_deck_id
    left join lateral (
      select deck_list ->> 'name' as name
      from jsonb_array_elements(
        case when jsonb_typeof(decks.deck_lists) = 'array' then decks.deck_lists else '[]'::jsonb end
      ) as deck_list
      where relational_list.id is null
        and deck_list ->> 'id' = ordered_logs.linked_deck_list_id
      limit 1
    ) as aggregate_list on true
  )
  select jsonb_build_object(
    'stats', jsonb_build_object(
      'games_played', stats.games_played,
      'games_won', stats.games_won,
      'games_lost', stats.games_lost
    ),
    'logs', coalesce(
      (select jsonb_agg(to_jsonb(enriched_logs)
        order by enriched_logs.date desc, enriched_logs.imported_at desc, enriched_logs.id desc)
       from enriched_logs),
      '[]'::jsonb
    )
  )
  from stats;
$function$;
revoke execute on function public.get_initial_logs_page_data(integer) from public, anon;
grant execute on function public.get_initial_logs_page_data(integer) to authenticated;

revoke all privileges on table public.deck_lists from public, anon, authenticated;
grant select on table public.deck_lists to authenticated;

notify pgrst, 'reload schema';
