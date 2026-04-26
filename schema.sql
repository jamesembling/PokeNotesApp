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
    coalesce(stats.games_played, 0)::bigint as games_played,
    coalesce(stats.games_won, 0)::bigint as games_won,
    coalesce(stats.games_lost, 0)::bigint as games_lost,
    coalesce(stats.attack_damage, 0)::bigint as attack_damage,
    coalesce(stats.opponent_attack_damage, 0)::bigint as opponent_attack_damage,
    coalesce(stats.coin_flips_won, 0)::bigint as coin_flips_won,
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
      )::integer as deck_list_count
    from public.decks
    group by user_id
  ),
  tournament_counts as (
    select user_id, count(*)::integer as tournament_count
    from public.tournaments
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
    p.login_count,
    p.created_at,
    coalesce(dc.deck_count, 0) as deck_count,
    coalesce(dc.deck_list_count, 0) as deck_list_count,
    coalesce(tc.tournament_count, 0) as tournament_count,
    coalesce(uls.games_played, 0)::integer as log_count
  from public.profiles p
  left join deck_counts dc on dc.user_id = p.id
  left join tournament_counts tc on tc.user_id = p.id
  left join public.user_log_stats uls on uls.user_id = p.id
  where exists (select 1 from current_profile where role = 'admin')
  order by
    case when p.role = 'admin' then 0 else 1 end,
    coalesce(p.last_active_at, p.last_login_at, p.auth_account_created_at, p.created_at) desc;
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
    case
      when jsonb_typeof(d.deck_lists) = 'array' then jsonb_array_length(d.deck_lists)
      else 0
    end as deck_list_count,
    d.created_at,
    d.updated_at
  from public.decks d
  where d.user_id = auth.uid()
  order by d.updated_at desc;
$$;

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
  id                text primary key,       -- cryptographically random token, 32+ chars
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
  'Share token. Must be cryptographically random and at least 32 characters. Never sequential.';
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
-- ARCHETYPE CATALOG
-- Known competitive deck archetypes sourced from Limitless TCG.
-- Used for automatic deck identification during log import.
-- Replaces the bundled battle-log-archetypes.js file.
-- ============================================================

create table public.archetype_catalog (
  id                text primary key,        -- e.g. "dragapult-ex", "charizard-ex"
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

  last_synced_at    timestamptz not null default now()
);

comment on table public.archetype_catalog is
  'Competitive deck archetypes from Limitless TCG. Refreshed daily by cron job.';
comment on column public.archetype_catalog.is_excluded is
  'When true, this archetype is skipped during log identification. See known-edge-cases.md 1.1.';
comment on column public.archetype_catalog.sprites is
  'Curated Pokemon slugs that visually represent this archetype in the UI.';
comment on column public.archetype_catalog.detection_sprites is
  'Additional Pokemon slugs that should count as evidence when identifying this archetype from a battle log.';
comment on column public.archetype_catalog.required_match_groups is
  'Optional grouped evidence requirements. Each group needs at least one matching Pokemon before the archetype can qualify.';


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
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  event_type              text not null check (event_type in ('hard-load', 'app-route')),
  from_path               text,
  to_path                 text not null,
  duration_ms             integer not null,
  loading_ms              integer,
  ttfb_ms                 integer,
  dom_content_loaded_ms   integer,
  load_event_ms           integer,
  total_blocking_time_ms  integer,
  max_long_task_ms        integer,
  resource_count          integer,
  slowest_resource_path   text,
  slowest_resource_ms     integer,
  transfer_size_bytes     integer,
  viewport_width          integer,
  viewport_height         integer,
  screen_width            integer,
  screen_height           integer,
  hardware_concurrency    integer,
  device_memory           numeric,
  effective_type          text,
  downlink                numeric,
  rtt                     integer,
  save_data               boolean not null default false,
  user_agent              text,
  created_at              timestamptz not null default now()
);

comment on table public.route_performance_events is
  'Real-user route timing events captured from authenticated app sessions.';


-- ============================================================
-- INDEXES
-- Added for every column used in filtering, sorting, or joins.
-- ============================================================

-- Logs: primary query patterns
create index logs_user_date
  on public.logs (user_id, date desc);

create index logs_user_result
  on public.logs (user_id, result);

create index logs_user_format
  on public.logs (user_id, format);

create index logs_user_opponent_deck
  on public.logs (user_id, opponent_deck_slug);

create index logs_user_go_order
  on public.logs (user_id, go_order);

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

-- Archetype catalog
create index archetype_catalog_excluded
  on public.archetype_catalog (is_excluded)
  where is_excluded = false;

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

create trigger set_logs_updated_at
  before update on public.logs
  for each row execute function set_updated_at();

create trigger set_decks_updated_at
  before update on public.decks
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

create trigger refresh_user_log_stats_after_insert
  after insert on public.logs
  for each row execute function public.sync_user_log_stats_from_log_row();

create trigger refresh_user_log_stats_after_delete
  after delete on public.logs
  for each row execute function public.sync_user_log_stats_from_log_row();

create trigger refresh_user_log_stats_after_stats_update
  after update of user_id, result, coin_toss_won, self_prizes_taken, opponent_prizes_taken,
    self_attack_damage, opponent_attack_damage, self_mulligans
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


-- ARCHETYPE CATALOG
-- Public read. Only service role can write (via cron).
alter table public.archetype_catalog enable row level security;

create policy "Anyone can read archetype catalog"
  on public.archetype_catalog for select
  using (true);


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

notify pgrst, 'reload schema';
