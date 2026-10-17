set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Expired previews get a 24-hour grace period. Consumed parser payloads are
-- removed after 24 hours; their compact receipt survives until the saved log
-- or account is deleted, so completed save retries remain idempotent.
create index if not exists battle_log_import_drafts_abandoned_expiry
  on public.battle_log_import_drafts (expires_at)
  where consumed_at is null;
create index if not exists battle_log_import_drafts_payload_retention
  on public.battle_log_import_drafts (consumed_at)
  where consumed_at is not null and immutable_facts <> '{}'::jsonb;

create or replace function private.prune_battle_log_import_drafts(p_limit integer default 500)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_deleted integer;
  v_cleared integer;
begin
  if p_limit is null or p_limit < 1 or p_limit > 5000 then
    raise exception using errcode = '22023', message = 'Cleanup batch size must be between 1 and 5000.';
  end if;
  with candidates as (
    select id from public.battle_log_import_drafts
    where consumed_at is null and expires_at < statement_timestamp() - interval '24 hours'
    order by expires_at, id limit p_limit for update skip locked
  )
  delete from public.battle_log_import_drafts d using candidates c where d.id = c.id;
  get diagnostics v_deleted = row_count;

  with candidates as (
    select id from public.battle_log_import_drafts
    where consumed_at < statement_timestamp() - interval '24 hours'
      and immutable_facts <> '{}'::jsonb
    order by consumed_at, id limit p_limit for update skip locked
  )
  update public.battle_log_import_drafts d
  set immutable_facts = '{}'::jsonb,
      -- Previous application releases read this one field on a completed retry.
      -- Preserve it during rolling deployment/rollback; no raw parser text stays.
      initial_editable = jsonb_build_object(
        'selfDeckSprites', coalesce(d.initial_editable -> 'selfDeckSprites', '[]'::jsonb)
      )
  from candidates c where d.id = c.id;
  get diagnostics v_cleared = row_count;
  return jsonb_build_object('deletedDrafts', v_deleted, 'clearedPayloads', v_cleared);
end;
$function$;
revoke all on function private.prune_battle_log_import_drafts(integer) from public, anon, authenticated;
comment on function private.prune_battle_log_import_drafts(integer) is
  'Hourly bounded cleanup: 24-hour expiry grace and consumed payload retention; compact save receipts retain idempotency and cascade with the saved log/account.';

select cron.schedule(
  'prune-battle-log-import-drafts', '17 * * * *',
  'select private.prune_battle_log_import_drafts();'
);
