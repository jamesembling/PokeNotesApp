-- Keep optional deck and deck-list links in a single coherent state for every
-- write path, including foreign-key actions triggered by direct deck deletes.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

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
