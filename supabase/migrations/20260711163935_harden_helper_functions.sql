-- Live migration ledger version: 20260711163935.
-- Keep trigger/event-trigger helpers out of the public API and pin their
-- namespace resolution so a future object cannot shadow built-in functions.

alter function public.set_updated_at()
  set search_path = pg_catalog;

alter function public.update_log_search_vector()
  set search_path = pg_catalog;

revoke all on function public.rls_auto_enable()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
