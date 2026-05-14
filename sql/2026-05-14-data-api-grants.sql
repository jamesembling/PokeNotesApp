-- Explicit Data API grants for Supabase projects where public-schema tables
-- are no longer exposed to PostgREST/GraphQL by default.
-- RLS policies still decide which rows each role can access.

grant usage on schema public to anon, authenticated, service_role;

revoke all privileges on all tables in schema public from anon, authenticated, service_role;

grant select, insert, update on table public.profiles to authenticated;
grant all privileges on table public.profiles to service_role;

grant select, insert, update, delete on table public.decks to authenticated;
grant all privileges on table public.decks to service_role;

grant select, insert, update, delete on table public.tournaments to authenticated;
grant all privileges on table public.tournaments to service_role;

grant select, insert, update, delete on table public.tournament_rounds to authenticated;
grant all privileges on table public.tournament_rounds to service_role;

grant select, insert, update, delete on table public.logs to authenticated;
grant all privileges on table public.logs to service_role;

grant select on table public.user_log_stats to authenticated;
grant all privileges on table public.user_log_stats to service_role;

grant select on table public.deck_log_stats to authenticated;
grant all privileges on table public.deck_log_stats to service_role;

grant select on table public.user_archetype_matchup_stats to authenticated;
grant all privileges on table public.user_archetype_matchup_stats to service_role;

grant select on table public.log_shares to anon;
grant select, insert, delete on table public.log_shares to authenticated;
grant all privileges on table public.log_shares to service_role;

grant select on table public.pokemon_catalog to anon, authenticated;
grant all privileges on table public.pokemon_catalog to service_role;

grant select on table public.archetype_catalog to anon, authenticated;
grant all privileges on table public.archetype_catalog to service_role;

grant select on table public.role_permissions to anon, authenticated;
grant update on table public.role_permissions to authenticated;
grant all privileges on table public.role_permissions to service_role;

grant select, insert on table public.route_performance_events to authenticated;
grant all privileges on table public.route_performance_events to service_role;

notify pgrst, 'reload schema';
