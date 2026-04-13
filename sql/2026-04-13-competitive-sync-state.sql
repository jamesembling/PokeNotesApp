alter table public.competitive_archetype_snapshots
  drop column if exists average_finish;

create table if not exists public.competitive_tournament_results (
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

create table if not exists public.competitive_processed_tournaments (
  tournament_id      text primary key,
  tournament_date    timestamptz not null,
  tournament_players integer not null default 0,
  processed_at       timestamptz not null default now(),
  source             text not null default 'limitless'
                      check (source in ('limitless'))
);

comment on table public.competitive_processed_tournaments is
  'Tracks which tournaments have already been processed so sync jobs do not re-fetch standings indefinitely.';

create table if not exists public.competitive_sync_state (
  sync_key           text primary key,
  next_backfill_page integer not null default 2,
  last_run_at        timestamptz,
  last_status        text not null default 'idle',
  last_error         text not null default ''
);

comment on table public.competitive_sync_state is
  'Internal sync cursor and run status for controlled competitive data backfills.';

create index if not exists competitive_tournament_results_archetype_date
  on public.competitive_tournament_results (archetype_id, tournament_date desc);

create index if not exists competitive_tournament_results_date
  on public.competitive_tournament_results (tournament_date desc);

create index if not exists competitive_processed_tournaments_date
  on public.competitive_processed_tournaments (tournament_date desc, processed_at desc);
