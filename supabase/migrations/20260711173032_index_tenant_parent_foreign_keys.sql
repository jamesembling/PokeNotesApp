-- Cover the referencing columns of the two new composite ownership keys that
-- were not already prefixes of an existing index.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create index if not exists tournament_rounds_user_tournament
  on public.tournament_rounds (user_id, tournament_id);

create index if not exists tournaments_user_linked_deck
  on public.tournaments (user_id, linked_deck_id)
  where linked_deck_id is not null;
