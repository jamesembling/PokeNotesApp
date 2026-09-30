-- Keep the Limitless snapshot fresh even when GitHub's scheduled workflow is delayed.
-- The job is inert until the Production release workflow installs the shared token in Vault.
create extension if not exists pg_cron;
create schema if not exists extensions;
create extension if not exists pg_net with schema extensions;

alter table public.limitless_event_feed
  add column refresh_claim_token uuid,
  add column refresh_lease_until timestamptz,
  add constraint limitless_event_feed_refresh_lease_pair
    check ((refresh_claim_token is null) = (refresh_lease_until is null));

insert into public.limitless_event_feed (feed_key, events, refreshed_at)
values ('ptcg-standard-ptcgl', '[]'::jsonb, '1970-01-01 00:00:00+00')
on conflict (feed_key) do nothing;

create or replace function private.invoke_limitless_event_refresh()
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_sync_secret text;
begin
  select decrypted_secret into v_sync_secret
  from vault.decrypted_secrets
  where name = 'limitless_sync_secret';

  if nullif(v_sync_secret, '') is null then
    return;
  end if;

  perform net.http_get(
    url := 'https://poke-notes-app.vercel.app/api/cron/sync-limitless-events',
    params := jsonb_build_object('mode', 'primary'),
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_sync_secret),
    timeout_milliseconds := 35000
  );
end;
$function$;

revoke all on function private.invoke_limitless_event_refresh() from public, anon, authenticated;

select cron.schedule(
  'refresh-limitless-events-primary',
  '5 * * * *',
  'select private.invoke_limitless_event_refresh();'
);
