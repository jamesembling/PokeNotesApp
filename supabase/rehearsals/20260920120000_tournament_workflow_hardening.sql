-- Disposable verification for the hardening migration. This runs after the
-- real baseline migrations, through 20260920120000, against a fresh local DB.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '66666666-6666-4666-8666-666666666666', 'authenticated', 'authenticated', 'hardening-owner@pokenotes.local', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '77777777-7777-4777-8777-777777777777', 'authenticated', 'authenticated', 'hardening-other@pokenotes.local', '', now(), '{}', '{}', now(), now());

insert into public.tournaments (
  id, user_id, name, date_from, date_to, deck_name, deck_sprites,
  format, participation, category, placement, notes
) values
  ('hardening-source', '66666666-6666-4666-8666-666666666666', 'Source', current_date, current_date, 'Mew', '["mew-ex"]', 'Standard', 'player', '', '', '');

set role authenticated;
select set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-666666666666', false);

do $verify$
declare
  v_result jsonb;
  v_replay jsonb;
  v_expected timestamptz;
  v_list jsonb;
  v_list_id text := 'hardening-list';
  v_strategy_id text := 'hardening-strategy';
begin
  begin
    perform public.commit_tournament_metadata(
      'create', 'hardening-invalid', 'hardening-invalid',
      jsonb_build_object(
        'name', 'Invalid', 'tournament_identifier', '', 'location', '',
        'championship_points', 0, 'professor_points', null,
        'date_from', current_date::text, 'date_to', current_date::text,
        'linked_deck_id', null, 'linked_deck_list_id', null, 'deck_name', '',
        'deck_sprites', '[]'::jsonb, 'category', '', 'placement', '',
        'participation', 'player', 'judge_role', null, 'format', ' Standard', 'notes', ''
      )
    );
    raise exception 'invalid metadata create unexpectedly committed';
  exception when sqlstate '22023' then
    null;
  end;
  if (select count(*) from public.tournaments where id = 'hardening-invalid') <> 0 then
    raise exception 'invalid metadata create left a Tournament row';
  end if;

  select updated_at into strict v_expected from public.tournaments where id = 'hardening-source';
  begin
    perform public.commit_tournament_metadata(
      'update', 'hardening-source', 'hardening-invalid-update',
      jsonb_build_object(
        'name', 'Mutated', 'tournament_identifier', '', 'location', '',
        'championship_points', 0, 'professor_points', null,
        'date_from', current_date::text, 'date_to', (current_date - 1)::text,
        'linked_deck_id', null, 'linked_deck_list_id', null, 'deck_name', '',
        'deck_sprites', '[]'::jsonb, 'category', '', 'placement', '',
        'participation', 'player', 'judge_role', null, 'format', 'Standard', 'notes', ''
      ), v_expected
    );
    raise exception 'invalid metadata update unexpectedly committed';
  exception when sqlstate '22023' then
    null;
  end;
  if (select name from public.tournaments where id = 'hardening-source') <> 'Source'
    or (select updated_at from public.tournaments where id = 'hardening-source') is distinct from v_expected then
    raise exception 'invalid metadata update changed the Tournament';
  end if;

  v_result := public.commit_tournament_metadata(
    'create', 'hardening-delete', 'hardening-delete',
    jsonb_build_object(
      'name', 'Delete', 'tournament_identifier', '', 'location', '',
      'championship_points', 0, 'professor_points', null,
      'date_from', current_date::text, 'date_to', current_date::text,
      'linked_deck_id', null, 'linked_deck_list_id', null, 'deck_name', '',
      'deck_sprites', '[]'::jsonb, 'category', '', 'placement', '',
      'participation', 'player', 'judge_role', null, 'format', 'Standard', 'notes', ''
    )
  );
  if v_result ->> 'status' <> 'committed' then
    raise exception 'metadata create identity did not commit';
  end if;

  select updated_at into strict v_expected from public.tournaments where id = 'hardening-source';
  v_list := public.commit_first_class_deck_list(
    null, 'create',
    jsonb_build_object(
      'id', v_list_id, 'creationKey', v_list_id, 'name', 'Hardening list',
      'format', 'Standard', 'date', current_date::text, 'createdBy', 'Fixture',
      'notes', '', 'rawList', '4 Mew ex',
      'parsedCards', jsonb_build_array(
        jsonb_build_object('name', 'Basic Fire Energy', 'count', 8, 'category', 'Energy'),
        jsonb_build_object('name', 'Boss Orders', 'count', 4, 'category', 'Trainer', 'trainerType', 'Supporter'),
        jsonb_build_object('name', 'Mew ex', 'count', 4, 'category', 'Pokemon')
      ),
      'sortedCards', jsonb_build_array(
        jsonb_build_object('name', 'Basic Fire Energy', 'count', 8, 'category', 'Energy'),
        jsonb_build_object('name', 'Boss Orders', 'count', 4, 'category', 'Trainer', 'trainerType', 'Supporter'),
        jsonb_build_object('name', 'Mew ex', 'count', 4, 'category', 'Pokemon')
      ),
      'sortedCardsVersion', 1
    ), v_list_id, null, now()
  );
  select updated_at into strict v_expected from public.deck_lists where id = v_list_id;
  v_result := public.create_deck_strategy_from_list(
    v_strategy_id, v_strategy_id, v_list_id,
    jsonb_build_object('deckName', 'Mew Strategy', 'format', 'Standard', 'archetypeId', 'mew-ex', 'deckPokemon', jsonb_build_array('mew-ex')),
    v_expected
  );
  if v_result ->> 'status' <> 'committed' then
    raise exception 'Strategy-from-list did not commit';
  end if;
  if (select deck_lists -> 0 -> 'sortedCards' -> 0 ->> 'name' from public.decks where id = v_strategy_id) <> 'Mew ex'
    or (select deck_lists -> 0 -> 'sortedCardsVersion' from public.decks where id = v_strategy_id) <> '2'::jsonb then
    raise exception 'Strategy legacy mirror did not persist canonical ordering';
  end if;
  v_replay := public.create_deck_strategy_from_list(
    v_strategy_id, v_strategy_id, v_list_id,
    jsonb_build_object('deckName', 'Mew Strategy', 'format', 'Standard', 'archetypeId', 'mew-ex', 'deckPokemon', jsonb_build_array('mew-ex')),
    v_expected
  );
  if v_replay ->> 'status' <> 'idempotent' then
    raise exception 'Strategy-from-list replay did not remain idempotent';
  end if;

  v_result := public.commit_tournament_deck_list(
    'hardening-source', 'hardening-capture',
    jsonb_build_object(
      'sourceDeckListId', v_list_id,
      'parsedCards', jsonb_build_array(
        jsonb_build_object('name', 'Basic Fire Energy', 'count', 8, 'category', 'Energy'),
        jsonb_build_object('name', 'Boss Orders', 'count', 4, 'category', 'Trainer', 'trainerType', 'Supporter'),
        jsonb_build_object('name', 'Mew ex', 'count', 4, 'category', 'Pokemon')
      ),
      'sortedCards', jsonb_build_array(
        jsonb_build_object('name', 'Basic Fire Energy', 'count', 8, 'category', 'Energy'),
        jsonb_build_object('name', 'Boss Orders', 'count', 4, 'category', 'Trainer', 'trainerType', 'Supporter'),
        jsonb_build_object('name', 'Mew ex', 'count', 4, 'category', 'Pokemon')
      ),
      'sortedCardsVersion', 1, 'associateStrategy', false
    ), v_expected, 'Mew', jsonb_build_array('mew-ex'), v_strategy_id, v_list_id, false, false
  );
  if v_result ->> 'status' <> 'committed' then
    raise exception 'existing source capture did not commit';
  end if;
  if (select linked_deck_id from public.tournaments where id = 'hardening-source') is not null then
    raise exception 'existing source capture overwrote independent Strategy link';
  end if;
  if (select sorted_cards_version from public.tournament_deck_list_snapshots where tournament_id = 'hardening-source') <> 2
    or (select sorted_cards -> 0 ->> 'name' from public.tournament_deck_list_snapshots where tournament_id = 'hardening-source') <> 'Mew ex'
    or (select sorted_cards -> 1 ->> 'name' from public.tournament_deck_list_snapshots where tournament_id = 'hardening-source') <> 'Boss Orders'
    or (select sorted_cards -> 2 ->> 'category' from public.tournament_deck_list_snapshots where tournament_id = 'hardening-source') <> 'Energy' then
    raise exception 'existing source capture did not persist rebuilt ordering';
  end if;

  delete from public.tournaments where id = 'hardening-delete';
  v_replay := public.commit_tournament_metadata(
    'create', 'hardening-delete', 'hardening-delete',
    jsonb_build_object(
      'name', 'Delete', 'tournament_identifier', '', 'location', '',
      'championship_points', 0, 'professor_points', null,
      'date_from', current_date::text, 'date_to', current_date::text,
      'linked_deck_id', null, 'linked_deck_list_id', null, 'deck_name', '',
      'deck_sprites', '[]'::jsonb, 'category', '', 'placement', '',
      'participation', 'player', 'judge_role', null, 'format', 'Standard', 'notes', ''
    )
  );
  if v_replay ->> 'status' <> 'idempotent' or (select count(*) from public.tournaments where id = 'hardening-delete') <> 0 then
    raise exception 'metadata identity was lost after Tournament deletion';
  end if;
  delete from public.tournaments where id = 'hardening-source';
  if (select count(*) from public.tournament_deck_list_snapshots where tournament_id = 'hardening-source') <> 0 then
    raise exception 'Tournament deletion did not cascade its snapshot';
  end if;
  v_replay := public.commit_tournament_deck_list(
    'hardening-source', 'hardening-capture',
    jsonb_build_object(
      'sourceDeckListId', v_list_id,
      'parsedCards', jsonb_build_array(
        jsonb_build_object('name', 'Basic Fire Energy', 'count', 8, 'category', 'Energy'),
        jsonb_build_object('name', 'Boss Orders', 'count', 4, 'category', 'Trainer', 'trainerType', 'Supporter'),
        jsonb_build_object('name', 'Mew ex', 'count', 4, 'category', 'Pokemon')
      ),
      'sortedCards', jsonb_build_array(
        jsonb_build_object('name', 'Basic Fire Energy', 'count', 8, 'category', 'Energy'),
        jsonb_build_object('name', 'Boss Orders', 'count', 4, 'category', 'Trainer', 'trainerType', 'Supporter'),
        jsonb_build_object('name', 'Mew ex', 'count', 4, 'category', 'Pokemon')
      ),
      'sortedCardsVersion', 1, 'associateStrategy', false
    ), v_expected, 'Mew', jsonb_build_array('mew-ex'), v_strategy_id, v_list_id, false, false
  );
  if v_replay ->> 'status' <> 'idempotent' then
    raise exception 'capture command history was not retained after Tournament deletion';
  end if;
end;
$verify$;

select set_config('request.jwt.claim.sub', '77777777-7777-4777-8777-777777777777', false);
do $rls$
begin
  if (select count(*) from public.tournament_deck_list_snapshots where tournament_id = 'hardening-source') <> 0 then
    raise exception 'cross-tenant snapshot read was not denied';
  end if;
end;
$rls$;
reset role;
