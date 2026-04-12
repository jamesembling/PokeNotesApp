alter table public.tournaments
  add column if not exists linked_deck_list_id text;

comment on column public.tournaments.linked_deck_list_id is
  'References a deck list within linked_deck_id. Not a foreign key as deck lists are stored in JSONB.';

notify pgrst, 'reload schema';
