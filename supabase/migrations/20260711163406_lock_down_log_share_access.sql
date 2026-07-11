-- Live migration ledger version: 20260711163406.
-- Apply only after the application reads public shares through
-- public.get_active_log_share and creates them through public.create_log_share.

drop policy if exists "Anyone can read log shares" on public.log_shares;
drop policy if exists "Anyone can read active log shares" on public.log_shares;
drop policy if exists "Owners can create log shares" on public.log_shares;

revoke all privileges on table public.log_shares from anon, authenticated;
grant select, delete on table public.log_shares to authenticated;
grant all privileges on table public.log_shares to service_role;

-- The table is no longer a public API. Token possession is checked only by the
-- narrow RPC, whose result deliberately omits owner_user_id.
revoke all on function public.get_active_log_share(text) from public, anon, authenticated;
grant execute on function public.get_active_log_share(text) to anon, authenticated, service_role;

revoke all on function public.create_log_share(text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_log_share(text, text, jsonb)
  to authenticated, service_role;

notify pgrst, 'reload schema';
