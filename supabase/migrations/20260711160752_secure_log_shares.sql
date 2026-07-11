-- Live migration ledger version: 20260711160752.
-- Foundation release for token-scoped, short-lived, rate-limited battle-log
-- shares. This migration remains compatible with the currently deployed app;
-- direct anonymous/table access is removed in the post-deploy lockdown.

alter table public.log_shares
  alter column expires_at set default (now() + interval '7 days');

create index if not exists log_shares_owner_created_at
  on public.log_shares (owner_user_id, created_at desc);

drop policy if exists "Anyone can read log shares" on public.log_shares;
drop policy if exists "Anyone can read active log shares" on public.log_shares;
drop policy if exists "Owners can read own log shares" on public.log_shares;
drop policy if exists "Owners can create log shares" on public.log_shares;
drop policy if exists "Owners can delete log shares" on public.log_shares;

-- Temporary compatibility policy: every pre-existing link is revoked below,
-- and only newly created, unexpired rows remain readable until app cutover.
create policy "Anyone can read active log shares"
  on public.log_shares
  for select
  to anon, authenticated
  using (expires_at > statement_timestamp());

create policy "Owners can read own log shares"
  on public.log_shares
  for select
  to authenticated
  using ((select auth.uid()) = owner_user_id);

create policy "Owners can create log shares"
  on public.log_shares
  for insert
  to authenticated
  with check ((select auth.uid()) = owner_user_id);

create policy "Owners can delete log shares"
  on public.log_shares
  for delete
  to authenticated
  using ((select auth.uid()) = owner_user_id);

revoke all privileges on table public.log_shares from anon, authenticated;
grant select on table public.log_shares to anon;
grant select, insert, delete on table public.log_shares to authenticated;
grant all privileges on table public.log_shares to service_role;

create schema if not exists private;

create or replace function private.enforce_log_share_creation()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  created_time timestamptz := statement_timestamp();
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required.';
  end if;

  if new.owner_user_id <> current_user_id then
    raise exception using
      errcode = '42501',
      message = 'Share ownership must match the signed-in user.';
  end if;

  if new.source_log_id is null or not exists (
    select 1
    from public.logs as source_log
    where source_log.id = new.source_log_id
      and source_log.user_id = current_user_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'LOG_SHARE_SOURCE_NOT_FOUND';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pokenotes-log-share:' || current_user_id::text, 0)
  );

  if (
    select count(*)
    from public.log_shares as recent_share
    where recent_share.owner_user_id = current_user_id
      and recent_share.created_at > created_time - interval '24 hours'
  ) >= 50 then
    raise exception using
      errcode = 'P0001',
      message = 'LOG_SHARE_24_HOUR_LIMIT_REACHED';
  end if;

  new.expires_at := created_time + interval '7 days';
  new.created_at := created_time;
  new.updated_at := created_time;
  return new;
end;
$$;

revoke all on function private.enforce_log_share_creation() from public, anon, authenticated;

drop trigger if exists enforce_log_share_creation on public.log_shares;
create trigger enforce_log_share_creation
  before insert on public.log_shares
  for each row execute function private.enforce_log_share_creation();

create or replace function public.get_active_log_share(p_token text)
returns table (
  id text,
  source_log_id text,
  payload jsonb,
  expires_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    share.id,
    share.source_log_id,
    share.payload,
    share.expires_at,
    share.created_at
  from public.log_shares as share
  where share.id = p_token
    and share.expires_at > statement_timestamp()
  limit 1;
$$;

revoke all on function public.get_active_log_share(text) from public, anon, authenticated;
grant execute on function public.get_active_log_share(text) to anon, authenticated, service_role;

create or replace function public.create_log_share(
  p_token text,
  p_source_log_id text,
  p_payload jsonb
)
returns table (
  id text,
  source_log_id text,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  created_time timestamptz := statement_timestamp();
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required.';
  end if;

  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{16,128}$' then
    raise exception using
      errcode = '22023',
      message = 'Invalid share token.';
  end if;

  return query
  insert into public.log_shares (
    id,
    owner_user_id,
    source_log_id,
    payload,
    expires_at,
    created_at,
    updated_at
  )
  values (
    p_token,
    current_user_id,
    p_source_log_id,
    p_payload,
    created_time + interval '7 days',
    created_time,
    created_time
  )
  returning
    log_shares.id,
    log_shares.source_log_id,
    log_shares.expires_at,
    log_shares.created_at;
end;
$$;

revoke all on function public.create_log_share(text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_log_share(text, text, jsonb)
  to authenticated, service_role;

-- The product decision is to revoke every existing share link. Retain the rows
-- for incident evidence and owner history, but make them immediately inactive.
update public.log_shares
set
  expires_at = least(expires_at, statement_timestamp()),
  updated_at = statement_timestamp()
where expires_at > statement_timestamp();

notify pgrst, 'reload schema';
