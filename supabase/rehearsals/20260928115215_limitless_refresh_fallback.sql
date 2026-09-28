-- Apply the migration to the preceding schema before running this check.
do $verify$
declare
  v_rows integer;
  v_first_token uuid := gen_random_uuid();
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
    or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'Limitless Cron extensions are unavailable';
  end if;

  if not exists (
    select 1 from cron.job
    where jobname = 'refresh-limitless-events-primary'
      and schedule = '5 * * * *'
      and command = 'select private.invoke_limitless_event_refresh();'
  ) then
    raise exception 'Primary Limitless Cron job is missing';
  end if;

  if has_function_privilege('anon', 'private.invoke_limitless_event_refresh()', 'EXECUTE')
    or has_function_privilege('authenticated', 'private.invoke_limitless_event_refresh()', 'EXECUTE') then
    raise exception 'Limitless Cron function is callable by an API role';
  end if;

  insert into public.limitless_event_feed (feed_key, events, refreshed_at)
  values ('ptcg-standard-ptcgl', '[]'::jsonb, '1970-01-01 00:00:00+00')
  on conflict (feed_key) do update
    set refreshed_at = excluded.refreshed_at,
        refresh_claim_token = null,
        refresh_lease_until = null;

  update public.limitless_event_feed
  set refresh_claim_token = v_first_token,
      refresh_lease_until = now() + interval '1 minute'
  where feed_key = 'ptcg-standard-ptcgl'
    and refreshed_at < now() - interval '55 minutes'
    and (refresh_lease_until is null or refresh_lease_until < now());
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'First refresh did not claim the stale feed';
  end if;

  update public.limitless_event_feed
  set refresh_claim_token = gen_random_uuid(),
      refresh_lease_until = now() + interval '1 minute'
  where feed_key = 'ptcg-standard-ptcgl'
    and refreshed_at < now() - interval '75 minutes'
    and (refresh_lease_until is null or refresh_lease_until < now());
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'Overlapping refresh claimed an active lease';
  end if;

  update public.limitless_event_feed
  set refreshed_at = now(),
      refresh_claim_token = null,
      refresh_lease_until = null
  where feed_key = 'ptcg-standard-ptcgl'
    and refresh_claim_token = v_first_token;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'Claim owner could not complete its refresh';
  end if;

  update public.limitless_event_feed
  set refresh_claim_token = gen_random_uuid(),
      refresh_lease_until = now() + interval '1 minute'
  where feed_key = 'ptcg-standard-ptcgl'
    and refreshed_at < now() - interval '75 minutes'
    and (refresh_lease_until is null or refresh_lease_until < now());
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'Backup claimed a fresh feed';
  end if;

  if exists (select 1 from vault.secrets where name = 'limitless_sync_secret') then
    raise exception 'Rehearsal must not use a production Limitless credential';
  end if;
  perform private.invoke_limitless_event_refresh();
end;
$verify$;
