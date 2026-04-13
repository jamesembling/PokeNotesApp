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
comment on column public.decks.deck_lists is
  'Array of deck list objects. Each has id, name, format, rawList, and parsed card data.';
comment on column public.decks.matchup_plans is
  'Array of matchup plan objects linking this deck to specific matchup strategies.';


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
                             result = 'BYE' OR
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


-- ============================================================
-- LOG SHARES
-- Snapshot shares of battle logs for public viewing.
-- Snapshots are immutable — changes to the original log
-- do not affect existing shares.
-- ============================================================

create table public.log_shares (
  id                text primary key,       -- cryptographically random token, 32+ chars
  owner_user_id     uuid not null references auth.users(id) on delete cascade,

  -- Full snapshot of the log at time of sharing
  -- Includes all log fields plus resolved deck list if linked
  payload           jsonb not null,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.log_shares is
  'Public share tokens for battle logs. Payload is a full snapshot taken at share time.';
comment on column public.log_shares.id is
  'Share token. Must be cryptographically random and at least 32 characters. Never sequential.';
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


-- ============================================================
-- COMPETITIVE ARCHETYPE SNAPSHOTS
-- Cached external competitive data synced from Limitless in controlled batches.
-- User-facing pages read from this table only and never call Limitless directly.
-- ============================================================

create table public.competitive_archetype_snapshots (
  archetype_id      text not null,
  sample_days       integer not null default 7,
  appearance_count  integer not null default 0,
  best_finish       integer,
  top_cut_count     integer not null default 0,
  results           jsonb not null default '[]',
  source            text not null default 'limitless'
                      check (source in ('limitless')),
  synced_at         timestamptz not null default now(),

  primary key (archetype_id, sample_days)
);

comment on table public.competitive_archetype_snapshots is
  'Cached recent competitive archetype results from Limitless. Refreshed in controlled background syncs.';
comment on column public.competitive_archetype_snapshots.results is
  'Array of top competitive results for the archetype, including public decklist links.';

create table public.competitive_tournament_results (
  tournament_id      text not null,
  archetype_id       text not null,
  tournament_name    text not null default '',
  tournament_date    timestamptz not null,
  tournament_players integer not null default 0,
  player_id          text not null,
  player_name        text not null default '',
  finish_placing     integer not null,
  wins               integer not null default 0,
  losses             integer not null default 0,
  ties               integer not null default 0,
  decklist_url       text not null default '',
  source             text not null default 'limitless'
                       check (source in ('limitless')),
  synced_at          timestamptz not null default now(),

  primary key (tournament_id, player_id)
);

comment on table public.competitive_tournament_results is
  'Cached player-level competitive tournament results fetched from Limitless.';

create table public.competitive_processed_tournaments (
  tournament_id      text primary key,
  tournament_date    timestamptz not null,
  tournament_players integer not null default 0,
  processed_at       timestamptz not null default now(),
  source             text not null default 'limitless'
                       check (source in ('limitless'))
);

comment on table public.competitive_processed_tournaments is
  'Tracks which tournaments have already been processed so sync jobs do not re-fetch standings indefinitely.';

create table public.competitive_sync_state (
  sync_key           text primary key,
  next_backfill_page integer not null default 2,
  last_run_at        timestamptz,
  last_status        text not null default 'idle',
  last_error         text not null default ''
);

comment on table public.competitive_sync_state is
  'Internal sync cursor and run status for controlled competitive data backfills.';


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

create index logs_linked_deck
  on public.logs (linked_deck_id)
  where linked_deck_id is not null;

create index logs_imported_at
  on public.logs (user_id, imported_at desc);

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

create index competitive_archetype_snapshots_synced_at
  on public.competitive_archetype_snapshots (synced_at desc);

create index competitive_tournament_results_archetype_date
  on public.competitive_tournament_results (archetype_id, tournament_date desc);

create index competitive_tournament_results_date
  on public.competitive_tournament_results (tournament_date desc);

create index competitive_processed_tournaments_date
  on public.competitive_processed_tournaments (tournament_date desc, processed_at desc);

-- Log shares
create index log_shares_owner
  on public.log_shares (owner_user_id);


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

alter table public.competitive_archetype_snapshots enable row level security;

create policy "Anyone can read competitive archetype snapshots"
  on public.competitive_archetype_snapshots for select
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
