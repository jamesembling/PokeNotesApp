-- Serialize share creation and revocation per owner/log so concurrent create
-- requests cannot leave a second, hidden public token behind.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

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
  active_share public.log_shares%rowtype;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{16,128}$' then
    raise exception using errcode = '22023', message = 'Invalid share token.';
  end if;

  if p_payload is not null and octet_length(p_payload::text) > 262144 then
    raise exception using
      errcode = 'P0001',
      message = 'LOG_SHARE_PAYLOAD_TOO_LARGE';
  end if;

  if p_source_log_id is null or not exists (
    select 1
    from public.logs as source_log
    where source_log.id = p_source_log_id
      and source_log.user_id = current_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'LOG_SHARE_SOURCE_NOT_FOUND';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'pokenotes-log-share-source:' || current_user_id::text || ':' || p_source_log_id,
      0
    )
  );

  select share.*
  into active_share
  from public.log_shares as share
  where share.owner_user_id = current_user_id
    and share.source_log_id = p_source_log_id
    and share.expires_at > created_time
  order by share.created_at desc, share.id desc
  limit 1;

  if found then
    -- Retain historical rows while immediately invalidating duplicates created
    -- by the former read/insert/read race.
    update public.log_shares as duplicate_share
    set
      expires_at = least(duplicate_share.expires_at, created_time),
      updated_at = created_time
    where duplicate_share.owner_user_id = current_user_id
      and duplicate_share.source_log_id = p_source_log_id
      and duplicate_share.id <> active_share.id
      and duplicate_share.expires_at > created_time;

    return query
    select
      active_share.id,
      active_share.source_log_id,
      active_share.expires_at,
      active_share.created_at;
    return;
  end if;

  return query
  insert into public.log_shares (
    id, owner_user_id, source_log_id, payload, expires_at, created_at, updated_at
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

create or replace function public.revoke_log_share(p_share_id text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_source_log_id text;
  deleted_count bigint;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if p_share_id is null or btrim(p_share_id) = '' then
    raise exception using errcode = '22023', message = 'Share id is required.';
  end if;

  select share.source_log_id
  into target_source_log_id
  from public.log_shares as share
  where share.id = p_share_id
    and share.owner_user_id = current_user_id;

  if not found then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'pokenotes-log-share-source:' || current_user_id::text || ':' ||
        coalesce(target_source_log_id, 'legacy:' || p_share_id),
      0
    )
  );

  if target_source_log_id is null then
    delete from public.log_shares as owned_share
    where owned_share.id = p_share_id
      and owned_share.owner_user_id = current_user_id;
  else
    -- Revoke every token for this owner/log, including any duplicate produced
    -- before creation became atomic.
    delete from public.log_shares as owned_share
    where owned_share.owner_user_id = current_user_id
      and owned_share.source_log_id = target_source_log_id;
  end if;

  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

revoke all on function public.create_log_share(text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.create_log_share(text, text, jsonb)
  to authenticated, service_role;

revoke all on function public.revoke_log_share(text)
  from public, anon, authenticated, service_role;
grant execute on function public.revoke_log_share(text)
  to authenticated, service_role;

-- Owners retain read access for the private share-management UI. All writes
-- now pass through the authenticated, owner-scoped RPCs above.
revoke insert, update, delete on table public.log_shares from authenticated;

notify pgrst, 'reload schema';

-- End atomic log-share lifecycle boundary.
