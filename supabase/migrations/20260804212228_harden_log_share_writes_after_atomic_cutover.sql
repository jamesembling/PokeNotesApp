-- POST-CUTOVER ONLY: deploy after the application uses revoke_log_share and an
-- authenticated create/reuse/revoke/public-invalidation rehearsal has passed.
-- Rolling this out earlier would break revocation in the previously deployed
-- application, which still uses an owner-scoped direct DELETE.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

revoke insert, update, delete on table public.log_shares from authenticated;

notify pgrst, 'reload schema';
