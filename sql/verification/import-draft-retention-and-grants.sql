-- Synthetic, transactional verification for the forward migration and bootstrap.
begin;
do $verification$
declare
  v_user uuid := gen_random_uuid();
  v_live text := gen_random_uuid()::text;
  v_expired text := gen_random_uuid()::text;
  v_recent text := gen_random_uuid()::text;
  v_receipt jsonb;
  v_editable jsonb := '{"selfDeckSlug":"mew","selfDeckSprites":["mew"],"opponentDeckSlug":"pikachu","opponentDeckSprites":["pikachu"],"date":"2026-10-17","format":"Standard","linkedDeckId":null,"linkedDeckListId":null,"matchNotes":null}';
  v_resolved jsonb := '{"selfDeckName":"Mew","selfDeckSlug":"mew","selfDeckSprites":["mew"],"opponentDeckName":"Pikachu","opponentDeckSlug":"pikachu","opponentDeckSprites":["pikachu"]}';
begin
  insert into auth.users(id, aud, role, email) values(v_user, 'authenticated', 'authenticated', v_user::text || '@retention.pokenotes.local');
  insert into public.battle_log_import_drafts(id,user_id,immutable_facts,initial_editable,created_at,expires_at) values
    (v_live,v_user,'{"result":"Win","goOrder":"First","selfPlayerName":"RetentionTrainer","opponentPlayerName":"RetentionOpponent","reason":"Prizes","rawLog":"synthetic parser payload","sections":[]}',v_editable,now()-interval '1 minute',now()+interval '29 minutes'),
    (v_expired,v_user,'{}','{}',now()-interval '3 days',now()-interval '2 days'),
    (v_recent,v_user,'{}','{}',now()-interval '2 hours',now()-interval '1 hour');
  v_receipt := public.commit_battle_log_import_draft(v_user,v_live,'retention-save',v_editable,v_resolved);
  update public.battle_log_import_drafts set consumed_at=now()-interval '2 days' where id=v_live;
  perform private.prune_battle_log_import_drafts(5000);
  if exists(select 1 from public.battle_log_import_drafts where id=v_expired)
    or not exists(select 1 from public.battle_log_import_drafts where id=v_recent)
    or not exists(select 1 from public.battle_log_import_drafts where id=v_live and immutable_facts='{}' and initial_editable=jsonb_build_object('selfDeckSprites',v_editable->'selfDeckSprites') and consumed_fingerprint is not null)
  then raise exception 'Draft retention did not preserve grace/compact-receipt boundaries'; end if;
  if public.commit_battle_log_import_draft(v_user,v_live,'retention-save',v_editable,v_resolved)->>'battleLogId' <> v_receipt->>'battleLogId'
  then raise exception 'Pruning broke completed retry idempotency'; end if;
  begin
    perform public.commit_battle_log_import_draft(v_user,v_live,'retention-save',jsonb_set(v_editable,'{matchNotes}','"different"'),v_resolved);
    raise exception 'Expected changed-payload retry rejection';
  exception when unique_violation then null; end;
  begin
    perform public.commit_battle_log_import_draft(v_user,v_recent,'expired-save',v_editable,v_resolved);
    raise exception 'Expected expired draft rejection';
  exception when sqlstate 'P0001' then
    if sqlerrm not ilike '%expired%' then raise; end if;
  end;
  perform private.prune_battle_log_import_drafts(5000);
  if (select count(*) from public.logs where id=v_receipt->>'battleLogId') <> 1 then raise exception 'Pruning changed the saved Battle Log'; end if;
  if has_function_privilege('anon','private.prune_battle_log_import_drafts(integer)','EXECUTE')
    or has_function_privilege('authenticated','private.prune_battle_log_import_drafts(integer)','EXECUTE')
  then raise exception 'Cleanup function exposed to application roles'; end if;
  if not exists(select 1 from cron.job where jobname='prune-battle-log-import-drafts' and active) then raise exception 'Missing cleanup schedule'; end if;

  if has_table_privilege('anon','public.card_effect_catalog','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or has_table_privilege('authenticated','public.card_effect_catalog','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or not has_table_privilege('anon','public.card_effect_catalog','SELECT')
    or not has_table_privilege('authenticated','public.card_effect_catalog','SELECT')
    or has_table_privilege('anon','public.deck_matchups','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or has_table_privilege('authenticated','public.deck_matchups','TRUNCATE,REFERENCES,TRIGGER')
    or not has_table_privilege('authenticated','public.deck_matchups','SELECT')
    or not has_table_privilege('authenticated','public.deck_matchups','INSERT')
    or not has_table_privilege('authenticated','public.deck_matchups','UPDATE')
    or not has_table_privilege('authenticated','public.deck_matchups','DELETE')
  then raise exception 'Catalogue/Matchup grants do not match bootstrap permissions'; end if;
end;
$verification$;
rollback;
