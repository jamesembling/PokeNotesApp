set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Default privilege changes do not repair existing table grants. Reconcile
-- these objects explicitly with the fresh-installation contract, preserving RLS.
revoke all privileges on table public.card_effect_catalog from public, anon, authenticated;
grant select on table public.card_effect_catalog to anon, authenticated;
grant all privileges on table public.card_effect_catalog to service_role;

revoke all privileges on table public.deck_matchups from public, anon, authenticated;
grant select, insert, update, delete on table public.deck_matchups to authenticated;
grant all privileges on table public.deck_matchups to service_role;
