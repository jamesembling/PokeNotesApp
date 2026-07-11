-- Keep normal public snapshots comfortably above observed production usage
-- while rejecting accidental or abusive oversized payloads at the database
-- boundary. The largest reviewed row was 52,396 bytes; 256 KiB leaves almost
-- five times that headroom.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.log_shares
  add constraint log_shares_payload_max_256k
  check (octet_length(payload::text) <= 262144)
  not valid;

alter table public.log_shares
  validate constraint log_shares_payload_max_256k;

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

-- The future-routine hardening trigger removes implicit EXECUTE after the
-- replacement above. Re-establish only the reviewed callers explicitly.
revoke all on function public.create_log_share(text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.create_log_share(text, text, jsonb)
  to authenticated, service_role;

notify pgrst, 'reload schema';
