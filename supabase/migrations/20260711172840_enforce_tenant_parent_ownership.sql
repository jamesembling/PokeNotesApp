-- Enforce account ownership across parent/child relationships without changing data.
-- Existing rows were audited read-only before this migration; every relationship matched.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

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

notify pgrst, 'reload schema';
