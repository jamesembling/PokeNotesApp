-- Live migration ledger version: 20260711160848.
-- Compatibility foundation: immediately prevent role self-promotion while the
-- currently deployed profile sync continues to work. The post-deploy lockdown
-- removes the temporary system-column grants and direct INSERT permission.

create schema if not exists private;

create or replace function private.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as profile
    where profile.id = auth.uid()
      and profile.role = 'admin'
  );
$$;

revoke all on function private.is_current_user_admin() from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;
grant execute on function private.is_current_user_admin() to authenticated, service_role;

drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Admins can read all profiles" on public.profiles;
drop policy if exists "Users and admins can read profiles" on public.profiles;

create policy "Users and admins can read profiles"
  on public.profiles
  for select
  to authenticated
  using (
    (select auth.uid()) = id
    or (select private.is_current_user_admin())
  );

create policy "Users can update own profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Users can insert own profile"
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

revoke insert, update on table public.profiles from authenticated;
grant select on table public.profiles to authenticated;
grant insert (
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
) on table public.profiles to authenticated;
grant update (
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
) on table public.profiles to authenticated;
grant all privileges on table public.profiles to service_role;

create or replace function public.sync_current_profile()
returns public.profiles
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  auth_email text;
  auth_created_at timestamptz;
  auth_last_sign_in_at timestamptz;
  auth_metadata jsonb;
  fallback_display_name text;
  auth_first_name text;
  auth_last_name text;
  synced_profile public.profiles;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required.';
  end if;

  select
    coalesce(auth_user.email, ''),
    auth_user.created_at,
    auth_user.last_sign_in_at,
    coalesce(auth_user.raw_user_meta_data, '{}'::jsonb)
  into
    auth_email,
    auth_created_at,
    auth_last_sign_in_at,
    auth_metadata
  from auth.users as auth_user
  where auth_user.id = current_user_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'AUTH_USER_NOT_FOUND';
  end if;

  auth_first_name := coalesce(nullif(btrim(auth_metadata ->> 'given_name'), ''), '');
  auth_last_name := coalesce(nullif(btrim(auth_metadata ->> 'family_name'), ''), '');
  fallback_display_name := coalesce(
    nullif(btrim(auth_metadata ->> 'full_name'), ''),
    nullif(btrim(auth_metadata ->> 'name'), ''),
    nullif(btrim(concat_ws(' ', auth_first_name, auth_last_name)), ''),
    nullif(split_part(auth_email, '@', 1), ''),
    'Trainer'
  );

  insert into public.profiles (
    id,
    display_name,
    first_name,
    last_name,
    email,
    auth_account_created_at,
    last_login_at,
    last_active_at
  )
  values (
    current_user_id,
    fallback_display_name,
    auth_first_name,
    auth_last_name,
    auth_email,
    auth_created_at,
    auth_last_sign_in_at,
    statement_timestamp()
  )
  on conflict (id) do update
  set
    display_name = case
      when btrim(profiles.display_name) = '' then excluded.display_name
      else profiles.display_name
    end,
    first_name = case
      when btrim(profiles.first_name) = '' then excluded.first_name
      else profiles.first_name
    end,
    last_name = case
      when btrim(profiles.last_name) = '' then excluded.last_name
      else profiles.last_name
    end,
    email = excluded.email,
    auth_account_created_at = excluded.auth_account_created_at,
    last_login_at = excluded.last_login_at,
    last_active_at = excluded.last_active_at
  returning * into synced_profile;

  return synced_profile;
end;
$$;

revoke all on function public.sync_current_profile() from public, anon, authenticated;
grant execute on function public.sync_current_profile() to authenticated, service_role;

create or replace function public.touch_current_profile_activity()
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  activity_time timestamptz;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required.';
  end if;

  update public.profiles as profile
  set last_active_at = statement_timestamp()
  where profile.id = current_user_id
    and (
      profile.last_active_at is null
      or profile.last_active_at <= statement_timestamp() - interval '15 minutes'
    )
  returning profile.last_active_at into activity_time;

  if activity_time is null then
    select profile.last_active_at
    into activity_time
    from public.profiles as profile
    where profile.id = current_user_id;
  end if;

  return activity_time;
end;
$$;

revoke all on function public.touch_current_profile_activity()
  from public, anon, authenticated;
grant execute on function public.touch_current_profile_activity()
  to authenticated, service_role;

create or replace function public.set_profile_role(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_role text
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  target_current_role text;
begin
  if p_role not in ('user', 'admin') then
    raise exception using
      errcode = '22023',
      message = 'Choose a valid role.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pokenotes-profile-role', 0)
  );

  if not exists (
    select 1
    from public.profiles as actor_profile
    where actor_profile.id = p_actor_user_id
      and actor_profile.role = 'admin'
  ) then
    raise exception using
      errcode = '42501',
      message = 'You do not have permission to update roles.';
  end if;

  select profile.role
  into target_current_role
  from public.profiles as profile
  where profile.id = p_target_user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'User profile not found.';
  end if;

  if target_current_role = 'admin'
    and p_role = 'user'
    and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception using
      errcode = 'P0001',
      message = 'You cannot remove admin access from the only admin account.';
  end if;

  update public.profiles
  set role = p_role
  where id = p_target_user_id;
end;
$$;

revoke all on function public.set_profile_role(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.set_profile_role(uuid, uuid, text)
  to service_role;

-- These RPCs perform their own database-role check and are used only by signed-in
-- admin pages. Remove inherited anonymous execution explicitly.
revoke all on function public.get_admin_dashboard_overview()
  from public, anon, authenticated;
grant execute on function public.get_admin_dashboard_overview()
  to authenticated, service_role;

revoke all on function public.get_admin_users_overview()
  from public, anon, authenticated;
grant execute on function public.get_admin_users_overview()
  to authenticated, service_role;

notify pgrst, 'reload schema';
