-- Live migration ledger version: 20260711164409.
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

notify pgrst, 'reload schema';
