-- Live migration ledger version: 20260711161528.
-- Count creation attempts independently from revocable/deletable share rows so
-- deleting a link cannot reset the rolling 24-hour allowance.

create schema if not exists private;

create table if not exists private.log_share_creation_events (
  id bigint generated always as identity primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table private.log_share_creation_events enable row level security;

revoke all privileges on table private.log_share_creation_events
  from public, anon, authenticated;
grant all privileges on table private.log_share_creation_events to service_role;

create index if not exists log_share_creation_events_owner_created_at
  on private.log_share_creation_events (owner_user_id, created_at desc);

-- Preserve any creations from the current rolling window when introducing the
-- ledger. The migration is applied once through official migration history.
insert into private.log_share_creation_events (owner_user_id, created_at)
select share.owner_user_id, share.created_at
from public.log_shares as share
where share.created_at > statement_timestamp() - interval '24 hours';

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

  delete from private.log_share_creation_events as old_event
  where old_event.owner_user_id = current_user_id
    and old_event.created_at <= created_time - interval '8 days';

  if (
    select count(*)
    from private.log_share_creation_events as recent_event
    where recent_event.owner_user_id = current_user_id
      and recent_event.created_at > created_time - interval '24 hours'
  ) >= 50 then
    raise exception using
      errcode = 'P0001',
      message = 'LOG_SHARE_24_HOUR_LIMIT_REACHED';
  end if;

  insert into private.log_share_creation_events (owner_user_id, created_at)
  values (current_user_id, created_time);

  new.expires_at := created_time + interval '7 days';
  new.created_at := created_time;
  new.updated_at := created_time;
  return new;
end;
$$;

revoke all on function private.enforce_log_share_creation()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
