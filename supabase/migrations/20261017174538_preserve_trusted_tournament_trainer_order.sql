-- Resolve Trainer classification from published reference evidence rather than
-- trusting client-supplied ordering or subtype fields. No historical rows change.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.canonicalize_deck_list_cards(p_cards jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_cards jsonb := '[]'::jsonb;
  v_card jsonb;
  v_type text;
  v_generation uuid;
  v_result jsonb;
begin
  if jsonb_typeof(p_cards) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Complete parsed Deck List evidence is required.';
  end if;

  select active.generation_id into v_generation
  from public.card_definition_active active
  join public.card_definition_generations generation on generation.id = active.generation_id
  where active.singleton and generation.completed_at is not null;

  for v_card in select value from jsonb_array_elements(p_cards) loop
    if jsonb_typeof(v_card) is distinct from 'object'
      or nullif(btrim(v_card ->> 'name'), '') is null
      or coalesce(v_card ->> 'count', '') !~ '^[1-9][0-9]*$'
      or lower(coalesce(v_card ->> 'category', '')) not in ('pokemon', 'trainer', 'energy')
    then
      raise exception using errcode = '22023', message = 'Complete parsed Deck List evidence is required.';
    end if;
    if lower(v_card ->> 'category') = 'trainer' then
      -- Use every matching printing in the published corpus. Missing fields or
      -- disagreement invalidate the claim, including a supplied client subtype.
      select case when count(*) > 0 and bool_and(
          coalesce(definition ->> 'category', '') = 'Trainer'
          and lower(coalesce(definition ->> 'trainerType', '')) in ('supporter', 'item', 'tool', 'stadium')
        ) and count(distinct lower(definition ->> 'trainerType')) = 1
        then min(lower(definition ->> 'trainerType')) end
      into v_type
      from public.card_definition_catalog
      where generation_id = v_generation
        and lower(btrim(replace(definition ->> 'name', '’', '''')))
          = lower(btrim(replace(v_card ->> 'name', '’', '''')));
      if v_type is null then
        raise exception using errcode = '22023', message = 'Complete trusted Trainer ordering metadata is unavailable; refresh-and-retry after the card catalog is available.';
      end if;
      v_card := (v_card - 'trainer_type') || jsonb_build_object('trainerType', v_type);
    end if;
    v_cards := v_cards || jsonb_build_array(v_card);
  end loop;
  select coalesce(
    jsonb_agg(item.value order by
      case lower(coalesce(item.value ->> 'category', ''))
        when 'pokemon' then 0
        when 'trainer' then 1
        when 'energy' then 2
        else 3
      end,
      case
        when lower(coalesce(item.value ->> 'category', '')) = 'trainer' then
          case lower(coalesce(item.value ->> 'trainerType', item.value ->> 'trainer_type', ''))
            when 'supporter' then 0
            when 'item' then 1
            when 'tool' then 2
            when 'stadium' then 3
            else 4
          end
        else 0
      end,
      case when coalesce(item.value ->> 'count', '') ~ '^[0-9]+$'
        then (item.value ->> 'count')::integer else 0 end desc,
      lower(coalesce(item.value ->> 'name', '')),
      coalesce(item.value ->> 'name', ''),
      coalesce(item.value ->> 'set', ''),
      coalesce(item.value ->> 'number', ''),
      item.ordinality
    ),
    '[]'::jsonb
  )
  into v_result
  from jsonb_array_elements(
    case when jsonb_typeof(v_cards) = 'array' then v_cards else '[]'::jsonb end
  ) with ordinality as item(value, ordinality);
  return v_result;
end;
$function$;
revoke all on function public.canonicalize_deck_list_cards(jsonb) from public, anon;
grant execute on function public.canonicalize_deck_list_cards(jsonb) to authenticated;
notify pgrst, 'reload schema';

-- Resolve metadata only for a new capture, after durable idempotency replay.
-- Source captures derive from their locked source row, never request arrays.
create or replace function public.commit_tournament_deck_list(
  p_tournament_id text,
  p_request_id text,
  p_payload jsonb,
  p_expected_tournament_updated_at timestamptz,
  p_deck_name text,
  p_deck_sprites jsonb,
  p_source_deck_id text default null,
  p_source_deck_list_id text default null,
  p_create_deck_list boolean default true,
  p_allow_replace boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_tournament public.tournaments%rowtype;
  v_snapshot public.tournament_deck_list_snapshots%rowtype;
  v_command public.tournament_deck_list_commands%rowtype;
  v_source_list public.deck_lists%rowtype;
  v_list public.deck_lists%rowtype;
  v_list_id text;
  v_request_id text := nullif(btrim(p_request_id), '');
  v_source_deck_id text := nullif(btrim(p_source_deck_id), '');
  v_source_deck_list_id text := nullif(btrim(p_source_deck_list_id), '');
  v_payload_hash text;
  v_now timestamptz := clock_timestamp();
  v_position integer;
  v_requested_fingerprint jsonb;
  v_existing_fingerprint jsonb;
  v_result jsonb;
  v_update_deck_association boolean := (p_payload ->> 'associateStrategy') = 'true';
  v_canonical_sorted jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if v_request_id is null then
    raise exception using errcode = '22023', message = 'A Tournament request id is required.';
  end if;
  if length(v_request_id) > 200 then
    raise exception using errcode = '22023', message = 'Tournament request id is too long.';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Deck List payload must be an object.';
  end if;
  if p_deck_sprites is null or jsonb_typeof(p_deck_sprites) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Tournament deck sprites are invalid.';
  end if;

  -- Serialize request identity before the first-writer row exists.
  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':tournament-deck-list-request:' || v_request_id, 0)
  );

  v_payload_hash := md5(jsonb_build_object(
    'tournamentId', p_tournament_id,
    'payload', p_payload - 'createdAt' - 'created_at' - 'updatedAt' - 'updated_at',
    'deckName', coalesce(p_deck_name, ''),
    'deckSprites', p_deck_sprites,
    'sourceDeckId', v_source_deck_id,
    'sourceDeckListId', v_source_deck_list_id,
    'createDeckList', p_create_deck_list,
    'allowReplace', p_allow_replace,
    'updateDeckAssociation', v_update_deck_association
  )::text);

  select * into v_command
  from public.tournament_deck_list_commands
  where user_id = v_user_id and operation = 'capture' and request_id = v_request_id
  for update;
  if found then
    if v_command.payload_hash <> v_payload_hash then
      raise exception using errcode = '23505', message = 'That Tournament request id was already used with different values.';
    end if;
    return jsonb_set(v_command.result, '{status}', '"idempotent"'::jsonb);
  end if;

  select * into v_snapshot
  from public.tournament_deck_list_snapshots
  where user_id = v_user_id and request_id = v_request_id
  for update;
  if found then
    if v_snapshot.payload_hash <> v_payload_hash then
      raise exception using errcode = '23505', message = 'That Tournament request id was already used with different values.';
    end if;
    return jsonb_build_object(
      'status', 'idempotent',
      'tournamentId', v_snapshot.tournament_id,
      'deckListId', v_snapshot.source_deck_list_id,
      'snapshotId', v_snapshot.id,
      'requestId', v_snapshot.request_id,
      'payloadHash', v_snapshot.payload_hash
    );
  end if;

  select * into v_tournament
  from public.tournaments
  where id = p_tournament_id and user_id = v_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Tournament could not be found.';
  end if;
  if p_expected_tournament_updated_at is null
    or v_tournament.updated_at is distinct from p_expected_tournament_updated_at
  then
    raise exception using errcode = 'P0001', message = 'Tournament changed; refresh-and-retry before saving its Deck List.';
  end if;
  if nullif(btrim(v_tournament.linked_deck_list_id), '') is not null
    and not p_allow_replace
    and not (
      not p_create_deck_list
      and v_source_deck_list_id = nullif(btrim(v_tournament.linked_deck_list_id), '')
    )
  then
    raise exception using errcode = 'P0001', message = 'This Tournament already has a Deck List; use replace or remove first.';
  end if;
  if p_allow_replace then
    delete from public.tournament_deck_list_snapshots
    where user_id = v_user_id and tournament_id = p_tournament_id;
  end if;

  if p_create_deck_list then
    v_list_id := nullif(btrim(p_payload ->> 'id'), '');
    if v_list_id is null or nullif(btrim(p_payload ->> 'creationKey'), '') is null then
      raise exception using errcode = '22023', message = 'A standalone Deck List id and creation key are required.';
    end if;
    if nullif(btrim(p_payload ->> 'creationKey'), '') <> v_list_id then
      raise exception using errcode = '22023', message = 'Deck List id and creation key must match.';
    end if;
    if v_source_deck_id is not null or v_source_deck_list_id is not null then
      raise exception using errcode = '22023', message = 'A standalone Deck List cannot have a source strategy.';
    end if;
    if nullif(btrim(p_payload ->> 'name'), '') is null
      or nullif(btrim(coalesce(p_payload ->> 'rawList', p_payload ->> 'raw_list', '')), '') is null
      or jsonb_typeof(coalesce(p_payload -> 'parsedCards', p_payload -> 'parsed_cards')) is distinct from 'array'
      or jsonb_typeof(coalesce(p_payload -> 'sortedCards', p_payload -> 'sorted_cards')) is distinct from 'array'
      or jsonb_typeof(coalesce(p_payload -> 'sortedCardsVersion', p_payload -> 'sorted_cards_version')) is distinct from 'number'
    then
      raise exception using errcode = '22023', message = 'Complete Deck List evidence is required.';
    end if;

  v_canonical_sorted := public.canonicalize_deck_list_cards(
    coalesce(p_payload -> 'parsedCards', p_payload -> 'parsed_cards')
  );

    select * into v_list
    from public.deck_lists
    where user_id = v_user_id and (id = v_list_id or creation_key = v_list_id)
    for update;
    if found then
      v_requested_fingerprint := jsonb_build_object(
        'name', btrim(p_payload ->> 'name'),
        'format', coalesce(p_payload ->> 'format', ''),
        'date', coalesce(p_payload ->> 'date', ''),
        'createdBy', coalesce(p_payload ->> 'createdBy', p_payload ->> 'created_by', ''),
        'notes', coalesce(p_payload ->> 'notes', ''),
        'rawList', coalesce(p_payload ->> 'rawList', p_payload ->> 'raw_list', ''),
        'parsedCards', coalesce(p_payload -> 'parsedCards', p_payload -> 'parsed_cards'),
        'sortedCards', v_canonical_sorted,
        'sortedCardsVersion', 2
      );
      v_existing_fingerprint := jsonb_build_object(
        'name', v_list.name, 'format', v_list.format, 'date', v_list.date,
        'createdBy', v_list.created_by, 'notes', v_list.notes, 'rawList', v_list.raw_list,
        'parsedCards', v_list.parsed_cards, 'sortedCards', v_list.sorted_cards,
        'sortedCardsVersion', v_list.sorted_cards_version
      );
      if v_list.deck_id is not null or v_list.creation_key is distinct from v_list_id
        or v_existing_fingerprint <> v_requested_fingerprint
      then
        raise exception using errcode = '23505', message = 'That standalone Deck List identity was already used with different values.';
      end if;
    else
      select coalesce(min(position) - 1, 0) into v_position
      from public.deck_lists where user_id = v_user_id and deck_id is null;
      insert into public.deck_lists (
        id, deck_id, user_id, creation_key, name, format, date, created_by,
        notes, raw_list, parsed_cards, sorted_cards, sorted_cards_version,
        position, created_at, updated_at
      ) values (
        v_list_id, null, v_user_id, v_list_id, btrim(p_payload ->> 'name'),
        coalesce(p_payload ->> 'format', ''), coalesce(p_payload ->> 'date', ''),
        coalesce(p_payload ->> 'createdBy', p_payload ->> 'created_by', ''),
        coalesce(p_payload ->> 'notes', ''), coalesce(p_payload ->> 'rawList', p_payload ->> 'raw_list', ''),
        coalesce(p_payload -> 'parsedCards', p_payload -> 'parsed_cards'),
        v_canonical_sorted, 2,
        v_position, coalesce(nullif(p_payload ->> 'createdAt', '')::timestamptz, v_now), v_now
      ) returning * into v_list;
    end if;
    v_source_deck_list_id := v_list.id;
  else
    if v_source_deck_list_id is null then
      raise exception using errcode = '22023', message = 'A source Deck List is required.';
    end if;
    select * into v_source_list
    from public.deck_lists
    where user_id = v_user_id and id = v_source_deck_list_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Source Deck List could not be found.';
    end if;
    if v_source_deck_id is not null and v_source_list.deck_id is distinct from v_source_deck_id then
      raise exception using errcode = 'P0001', message = 'Source Deck List association changed; refresh-and-retry.';
    end if;
    v_source_deck_id := v_source_list.deck_id;
    v_list := v_source_list;
    v_list.sorted_cards := public.canonicalize_deck_list_cards(v_source_list.parsed_cards);
    v_list.sorted_cards_version := 2;
  end if;

  insert into public.tournament_deck_list_snapshots (
    id, tournament_id, user_id, source_deck_id, source_deck_list_id,
    request_id, payload_hash, name, format, date, created_by, notes,
    raw_list, parsed_cards, sorted_cards, sorted_cards_version, created_at
  ) values (
    gen_random_uuid()::text, p_tournament_id, v_user_id, v_source_deck_id,
    v_source_deck_list_id, v_request_id, v_payload_hash, v_list.name,
    v_list.format, v_list.date, v_list.created_by, v_list.notes, v_list.raw_list,
    v_list.parsed_cards, v_list.sorted_cards, v_list.sorted_cards_version, v_now
  ) returning * into v_snapshot;

  update public.tournaments
  set linked_deck_id = case when v_update_deck_association then v_source_deck_id else v_tournament.linked_deck_id end,
      linked_deck_list_id = v_source_deck_list_id,
      deck_name = coalesce(nullif(btrim(p_deck_name), ''), deck_name),
      deck_sprites = p_deck_sprites,
      updated_at = v_now
  where id = p_tournament_id and user_id = v_user_id;

  v_result := jsonb_build_object(
    'status', 'committed',
    'tournamentId', p_tournament_id,
    'deckListId', v_source_deck_list_id,
    'snapshotId', v_snapshot.id,
    'requestId', v_request_id,
    'payloadHash', v_payload_hash
  );
  insert into public.tournament_deck_list_commands (
    id, tournament_id, user_id, operation, request_id, payload_hash, result
  ) values (
    gen_random_uuid()::text, p_tournament_id, v_user_id, 'capture', v_request_id, v_payload_hash, v_result
  );
  return v_result;
end;
$function$;

revoke all on function public.commit_tournament_deck_list(
  text, text, jsonb, timestamptz, text, jsonb, text, text, boolean, boolean
) from public, anon;
grant execute on function public.commit_tournament_deck_list(
  text, text, jsonb, timestamptz, text, jsonb, text, text, boolean, boolean
) to authenticated;
