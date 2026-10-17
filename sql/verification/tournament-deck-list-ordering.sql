-- Actual post-migration behavior, all synthetic and transactionally discarded.
begin;
do $verification$
declare
  g uuid := gen_random_uuid();
  actor uuid := gen_random_uuid();
  source_cards jsonb := '[{"name":"Iono","count":1,"category":"Trainer","trainerType":"supporter"},{"name":"Ultra Ball","count":2,"category":"Trainer","trainerType":"item"},{"name":"Air Balloon","count":3,"category":"Trainer","trainerType":"tool"},{"name":"Festival Grounds","count":4,"category":"Trainer","trainerType":"stadium"}]';
  parsed jsonb := '[{"name":"Festival Grounds","count":4,"category":"Trainer"},{"name":"Air Balloon","count":3,"category":"Trainer"},{"name":"Ultra Ball","count":2,"category":"Trainer"},{"name":"Iono","count":1,"category":"Trainer"}]';
  result jsonb;
  captured jsonb;
  target text := 'ordering-' || gen_random_uuid();
  standalone text := 'ordering-' || gen_random_uuid();
  source_id text := 'ordering-' || gen_random_uuid();
  stamp timestamptz;
begin
  insert into public.card_definition_generations (id, source, expected_count, source_manifest_hash, source_coverage)
  values (g, 'tcgdex', 7, 'synthetic-trainer-order-verification', '{}');
  insert into public.card_definition_catalog (generation_id, source_card_id, normalized_card_name, definition)
  select g, name, lower(name), jsonb_build_object('sourceCardId', name, 'name', case when name = 'Conflicting 2' then 'Conflicting' else name end, 'category', 'Trainer', 'trainerType', kind)
  from (values ('Iono', 'Supporter'), ('Ultra Ball', 'Item'), ('Air Balloon', 'Tool'), ('Festival Grounds', 'Stadium'),
    ('Incomplete', null), ('Conflicting', 'Item'), ('Conflicting 2', 'Supporter')) as fixture(name, kind);
  -- Two printings of one name disagree; null fields are separately incomplete.
  update public.card_definition_generations set completed_at = now() where id = g;
  insert into public.card_definition_active (singleton, generation_id) values (true, g)
  on conflict (singleton) do update set generation_id = excluded.generation_id;

  if public.canonicalize_deck_list_cards(parsed) <> source_cards then
    raise exception 'Source canonical order and trusted SQL order differ';
  end if;
  if public.canonicalize_deck_list_cards('[{"name":"Iono","count":1,"category":"Trainer","trainerType":"Item"},{"name":"Ultra Ball","count":2,"category":"Trainer","trainerType":"Supporter"}]')
    <> '[{"name":"Iono","count":1,"category":"Trainer","trainerType":"supporter"},{"name":"Ultra Ball","count":2,"category":"Trainer","trainerType":"item"}]' then
    raise exception 'Client subtype was trusted';
  end if;
  for result in select jsonb_build_array(jsonb_build_object('name', name, 'count', 1, 'category', 'Trainer', 'trainerType', 'Supporter'))
    from (values ('Unknown'), ('Incomplete'), ('Conflicting')) as names(name)
  loop
    begin
      perform public.canonicalize_deck_list_cards(result);
      raise exception 'Incomplete or conflicting trusted metadata was accepted';
    exception when sqlstate '22023' then null;
    end;
  end loop;

  insert into auth.users (id, aud, role, email, created_at, updated_at) values (actor, 'authenticated', 'authenticated', actor || '@example.test', now(), now());
  insert into public.deck_lists (id, user_id, name, raw_list, parsed_cards, sorted_cards, sorted_cards_version)
  values (source_id, actor, 'Synthetic source', '1 Iono\n2 Ultra Ball\n3 Air Balloon\n4 Festival Grounds', parsed, source_cards, 2);
  insert into public.tournaments (id, user_id, name, date_from, date_to) values (target, actor, 'Synthetic capture', current_date, current_date) returning updated_at into stamp;
  perform set_config('request.jwt.claim.sub', actor::text, true);
  result := public.commit_tournament_deck_list(target, target, '{}', stamp, 'Fixture', '[]', null, source_id, false, false);
  select sorted_cards into captured from public.tournament_deck_list_snapshots where tournament_id = target;
  if captured <> source_cards then raise exception 'Source-to-snapshot Trainer parity failed'; end if;
  -- Immutable event evidence must remain unchanged after a source mutation.
  update public.deck_lists set sorted_cards = '[]' where id = source_id;
  if (select sorted_cards from public.tournament_deck_list_snapshots where tournament_id = target) <> captured then
    raise exception 'Source change rewrote historical snapshot';
  end if;

  insert into public.tournaments (id, user_id, name, date_from, date_to) values (standalone, actor, 'Synthetic standalone', current_date, current_date) returning updated_at into stamp;
  result := jsonb_build_object('id', standalone, 'creationKey', standalone, 'name', 'Synthetic list', 'rawList', 'Trainer fixture',
    'parsedCards', parsed, 'sortedCards', parsed, 'sortedCardsVersion', 2);
  perform public.commit_tournament_deck_list(standalone, standalone, result, stamp, 'Fixture', '[]');
  if (select sorted_cards from public.deck_lists where id = standalone) <> source_cards
    or (select sorted_cards from public.tournament_deck_list_snapshots where tournament_id = standalone) <> source_cards then
    raise exception 'Standalone-to-snapshot Trainer parity failed';
  end if;
  -- Replays do not need current catalog evidence or mutate the preserved result.
  delete from public.card_definition_active where singleton;
  if public.commit_tournament_deck_list(standalone, standalone, result, stamp, 'Fixture', '[]') ->> 'status' <> 'idempotent' then
    raise exception 'Durable retry required a new classification';
  end if;
end;
$verification$;
rollback;
