-- Disposable database verification for the Tournament snapshot command boundary.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 'tournament-rehearsal@pokenotes.local', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-4555-8555-555555555555', 'authenticated', 'authenticated', 'other-rehearsal@pokenotes.local', '', now(), '{}', '{}', now(), now());

insert into public.tournaments (
  id, user_id, name, date_from, date_to, deck_name, deck_sprites,
  format, participation, category, placement, notes
) values (
  'tournament-snapshot-rehearsal', '44444444-4444-4444-8444-444444444444',
  'Snapshot rehearsal', current_date, current_date, 'Mew / Dragapult', '["mew-ex", "dragapult-ex"]',
  'Standard', 'player', '', '', ''
);

set role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', false);

do $verify$
declare
  v_expected timestamptz;
  v_result jsonb;
  v_replay jsonb;
  v_request_id text := 'snapshot-rehearsal-request';
begin
  select updated_at into strict v_expected
  from public.tournaments
  where id = 'tournament-snapshot-rehearsal';

  select public.commit_tournament_deck_list(
    'tournament-snapshot-rehearsal', v_request_id,
    jsonb_build_object(
      'id', v_request_id, 'creationKey', v_request_id, 'name', 'Snapshot rehearsal',
      'format', 'Standard', 'date', current_date::text, 'createdBy', 'Fixture',
      'notes', 'captured', 'rawList', '4 Mew ex',
      'parsedCards', jsonb_build_array(jsonb_build_object('name', 'Mew ex', 'count', 4)),
      'sortedCards', jsonb_build_array(jsonb_build_object('name', 'Mew ex', 'count', 4)),
      'sortedCardsVersion', 2, 'createdAt', '2026-09-20T00:00:00Z', 'updatedAt', '2026-09-20T00:00:00Z'
    ), v_expected, 'Mew / Dragapult', jsonb_build_array('mew-ex', 'dragapult-ex')
  ) into v_result;
  if v_result ->> 'status' <> 'committed' then
    raise exception 'initial snapshot command did not commit';
  end if;

  select public.commit_tournament_deck_list(
    'tournament-snapshot-rehearsal', v_request_id,
    jsonb_build_object(
      'id', v_request_id, 'creationKey', v_request_id, 'name', 'Snapshot rehearsal',
      'format', 'Standard', 'date', current_date::text, 'createdBy', 'Fixture',
      'notes', 'captured', 'rawList', '4 Mew ex',
      'parsedCards', jsonb_build_array(jsonb_build_object('name', 'Mew ex', 'count', 4)),
      'sortedCards', jsonb_build_array(jsonb_build_object('name', 'Mew ex', 'count', 4)),
      'sortedCardsVersion', 2, 'createdAt', '2026-09-20T01:00:00Z', 'updatedAt', '2026-09-20T01:00:00Z'
    ), v_expected, 'Mew / Dragapult', jsonb_build_array('mew-ex', 'dragapult-ex')
  ) into v_replay;
  if v_replay ->> 'status' <> 'idempotent' then
    raise exception 'volatile timestamps changed the capture replay fingerprint';
  end if;

  if (select count(*) from public.tournament_deck_list_snapshots where tournament_id = 'tournament-snapshot-rehearsal') <> 1
    or (select count(*) from public.deck_lists where user_id = auth.uid() and id = v_request_id) <> 1 then
    raise exception 'capture did not leave exactly one list and snapshot';
  end if;

  perform set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', false);
  if (select count(*) from public.tournament_deck_list_snapshots where tournament_id = 'tournament-snapshot-rehearsal') <> 0 then
    raise exception 'cross-tenant snapshot read was not denied';
  end if;
end;
$verify$;

reset role;
