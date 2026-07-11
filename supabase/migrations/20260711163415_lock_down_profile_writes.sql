-- Live migration ledger version: 20260711163415.
-- Apply only after profile synchronization and activity updates use the trusted
-- RPCs introduced by 20260711160848_protect_profile_roles.sql.

drop policy if exists "Users can insert own profile" on public.profiles;

revoke insert on table public.profiles from authenticated;
revoke insert (
  id,
  display_name,
  first_name,
  last_name,
  email,
  ptcgl_username,
  avatar_color,
  auth_account_created_at,
  last_login_at,
  last_active_at
) on table public.profiles from authenticated;

revoke update (
  id,
  email,
  auth_account_created_at,
  last_login_at,
  last_active_at
) on table public.profiles from authenticated;

-- Reassert the only direct user-editable fields selected by the product.
grant update (
  display_name,
  first_name,
  last_name,
  ptcgl_username,
  avatar_color
) on table public.profiles to authenticated;

notify pgrst, 'reload schema';
