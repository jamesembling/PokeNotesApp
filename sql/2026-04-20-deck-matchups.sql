alter table public.decks
add column if not exists matchups jsonb not null default '[]';

comment on column public.decks.matchups is
  'Array of matchup plan objects. Each has id, deckName, deckPokemon, and timestamps.';
