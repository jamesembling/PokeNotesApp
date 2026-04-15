drop index if exists public.logs_linked_deck;

create index if not exists logs_user_linked_deck_date
  on public.logs (user_id, linked_deck_id, date desc, imported_at desc)
  where linked_deck_id is not null;

create index if not exists logs_user_unlinked_imported_at
  on public.logs (user_id, imported_at desc, id)
  where linked_deck_id is null;
