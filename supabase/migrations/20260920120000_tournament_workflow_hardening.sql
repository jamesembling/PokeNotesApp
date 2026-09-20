-- Forward hardening for Tournament metadata commands, independent links,
-- source ordering, and explicit Strategy creation from an existing Deck List.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Command ledgers are the replay boundary and must outlive the mutable
-- Tournament row. Snapshots remain owned by the Tournament and still cascade.
alter table public.tournament_deck_list_commands
  drop constraint if exists tournament_deck_list_commands_tournament_id_fkey;

-- The read model's canonical fallback is category, trainer subtype, count,
-- then stable card identity. Snapshot capture derives this from the
-- authoritative parsed source row so authenticated callers cannot smuggle a
-- misordered or stale sorted_cards array into immutable evidence.
create or replace function public.canonicalize_deck_list_cards(p_cards jsonb)
returns jsonb
language sql
immutable
set search_path = pg_catalog, public
as $function$
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
  from jsonb_array_elements(
    case when jsonb_typeof(p_cards) = 'array' then p_cards else '[]'::jsonb end
  ) with ordinality as item(value, ordinality);
$function$;
revoke all on function public.canonicalize_deck_list_cards(jsonb) from public, anon;
grant execute on function public.canonicalize_deck_list_cards(jsonb) to authenticated;

create table if not exists public.tournament_metadata_commands (
  id             text primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  -- Keep the request identity after a Tournament is deleted.  The ledger is
  -- the durable idempotency boundary for creation keys, so replaying a prior
  -- create request must not resurrect a second Tournament.
  tournament_id  text not null,
  operation      text not null check (operation in ('create', 'update')),
  request_id     text not null,
  payload_hash   text not null,
  result         jsonb not null,
  created_at     timestamptz not null default now(),
  constraint tournament_metadata_commands_request_unique unique (user_id, request_id)
);

alter table public.tournament_metadata_commands enable row level security;
revoke all on public.tournament_metadata_commands from anon, authenticated;
grant all on public.tournament_metadata_commands to service_role;

create or replace function public.commit_tournament_metadata(
  p_operation text,
  p_tournament_id text,
  p_request_id text,
  p_payload jsonb,
  p_expected_tournament_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_command public.tournament_metadata_commands%rowtype;
  v_tournament public.tournaments%rowtype;
  v_request_id text := nullif(btrim(p_request_id), '');
  v_now timestamptz := clock_timestamp();
  v_payload_hash text;
  v_result jsonb;
  v_date_from date;
  v_date_to date;
  v_participation text;
  v_format text;
  v_placement text;
  v_category text;
  v_points bigint;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if p_operation not in ('create', 'update') then
    raise exception using errcode = '22023', message = 'Unsupported Tournament metadata operation.';
  end if;
  if v_request_id is null or length(v_request_id) > 200 then
    raise exception using errcode = '22023', message = 'A Tournament metadata request id is required.';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Tournament metadata must be an object.';
  end if;
  if nullif(btrim(p_tournament_id), '') is null then
    raise exception using errcode = '22023', message = 'Tournament id is required.';
  end if;
  if p_operation = 'create' and p_tournament_id <> v_request_id then
    raise exception using errcode = '22023', message = 'Tournament id must equal its creation key.';
  end if;

  if nullif(btrim(coalesce(p_payload ->> 'name', '')), '') is null
    or p_payload ->> 'name' <> btrim(p_payload ->> 'name')
  then
    raise exception using errcode = '22023', message = 'Tournament name is required and must be trimmed.';
  end if;
  if nullif(btrim(coalesce(p_payload ->> 'format', '')), '') is null
    or p_payload ->> 'format' <> btrim(p_payload ->> 'format')
  then
    raise exception using errcode = '22023', message = 'Tournament format is required and must be trimmed.';
  end if;
  v_format := p_payload ->> 'format';
  if v_format not in (
    'TEF-PBL', 'TEF-CRI', 'TEF-POR', 'SVI-ASC', 'SVI-PFL', 'SVI-MEG',
    'SVI-WHT/BLK', 'SVI-DRI', 'SVI-JTG', 'BRS-PRE', 'BRS-SSP', 'BRS-SCR',
    'Expanded', 'GLC', 'PTCG Pocket'
  ) then
    raise exception using errcode = '22023', message = 'Tournament format is not an allowed site format.';
  end if;
  begin
    v_date_from := nullif(btrim(coalesce(p_payload ->> 'date_from', '')), '')::date;
    v_date_to := nullif(btrim(coalesce(p_payload ->> 'date_to', '')), '')::date;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = '22023', message = 'Tournament dates must be valid calendar dates.';
  end;
  if v_date_from is null or v_date_to is null then
    raise exception using errcode = '22023', message = 'Tournament dates are required.';
  end if;
  if v_date_to < v_date_from then
    raise exception using errcode = '22023', message = 'Tournament end date cannot be before its start date.';
  end if;

  v_participation := coalesce(p_payload ->> 'participation', 'player');
  v_placement := coalesce(p_payload ->> 'placement', '');
  if v_placement not in (
    '', 'no placement', 'dropped', 'second', 'third', 'fourth', 'fifth',
    'sixth', 'seventh', 'eighth', 't1024', 't512', 't256', 't128', 't64',
    't32', 't16', 't8', 't4', 'finalist', 'champion'
  ) then
    raise exception using errcode = '22023', message = 'Tournament placement is invalid.';
  end if;
  if v_participation not in ('player', 'judge') then
    raise exception using errcode = '22023', message = 'Tournament participation must be player or judge.';
  end if;
  if v_participation = 'judge' then
    if p_payload ->> 'judge_role' not in ('judge', 'head judge') then
      raise exception using errcode = '22023', message = 'A valid judge role is required for judge participation.';
    end if;
    if nullif(p_payload ->> 'placement', '') is not null then
      raise exception using errcode = '22023', message = 'Judges cannot have a player placement.';
    end if;
  elsif nullif(p_payload ->> 'judge_role', '') is not null then
    raise exception using errcode = '22023', message = 'Player tournaments cannot have a judge role.';
  end if;
  if v_participation = 'player' and p_payload ->> 'professor_points' is not null then
    raise exception using errcode = '22023', message = 'Professor Points are only valid for judge participation.';
  end if;
  if v_participation = 'judge' and p_payload ->> 'championship_points' is not null then
    raise exception using errcode = '22023', message = 'Championship Points are only valid for player participation.';
  end if;
  if v_participation = 'player' and p_payload ->> 'championship_points' is not null then
    if p_payload ->> 'championship_points' !~ '^[0-9]+$' then
      raise exception using errcode = '22023', message = 'Championship Points must be a whole number of 0 or more.';
    end if;
    begin
      v_points := (p_payload ->> 'championship_points')::bigint;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception using errcode = '22023', message = 'Championship Points must be a whole number of 0 or more.';
    end;
    if v_points > 2147483647 then
      raise exception using errcode = '22023', message = 'Championship Points are too large to save.';
    end if;
  end if;
  if v_participation = 'judge' and p_payload ->> 'professor_points' is not null then
    if p_payload ->> 'professor_points' !~ '^[0-9]+$' then
      raise exception using errcode = '22023', message = 'Professor Points must be a whole number of 0 or more.';
    end if;
    begin
      v_points := (p_payload ->> 'professor_points')::bigint;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception using errcode = '22023', message = 'Professor Points must be a whole number of 0 or more.';
    end;
    if v_points > 2147483647 then
      raise exception using errcode = '22023', message = 'Professor Points are too large to save.';
    end if;
  end if;
  v_category := coalesce(p_payload ->> 'category', '');
  if v_category not in ('', 'online', 'local', 'challenge', 'cup', 'prerelease', 'regional', 'international', 'world') then
    raise exception using errcode = '22023', message = 'Tournament category is invalid.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':tournament-metadata:' || v_request_id, 0)
  );
  v_payload_hash := md5(jsonb_build_object(
    'operation', p_operation,
    'tournamentId', p_tournament_id,
    'payload', p_payload
  )::text);

  select * into v_command
  from public.tournament_metadata_commands
  where user_id = v_user_id and request_id = v_request_id
  for update;
  if found then
    if v_command.payload_hash <> v_payload_hash then
      raise exception using errcode = '23505', message = 'That Tournament metadata request id was already used with different values.';
    end if;
    return jsonb_set(v_command.result, '{status}', '"idempotent"'::jsonb);
  end if;

  if nullif(p_payload ->> 'linked_deck_id', '') is not null
    and not exists (
      select 1 from public.decks
      where id = nullif(p_payload ->> 'linked_deck_id', '')
        and user_id = v_user_id
    )
  then
    raise exception using errcode = '42501', message = 'The linked Deck Strategy is not owned by this account.';
  end if;
  if nullif(p_payload ->> 'linked_deck_list_id', '') is not null
    and not public.can_use_deck_list_reference(
      v_user_id,
      nullif(p_payload ->> 'linked_deck_id', ''),
      nullif(p_payload ->> 'linked_deck_list_id', '')
    )
  then
    raise exception using errcode = '42501', message = 'The linked Deck List is not owned by this account.';
  end if;

  if p_operation = 'create' then
    if exists (select 1 from public.tournaments where id = p_tournament_id) then
      raise exception using errcode = '23505', message = 'That Tournament creation identity is already in use.';
    end if;
    insert into public.tournaments (
      id, user_id, name, tournament_identifier, location,
      championship_points, professor_points, date_from, date_to,
      linked_deck_id, linked_deck_list_id, deck_name, deck_sprites,
      category, placement, participation, judge_role, format, notes,
      created_at, updated_at
    ) values (
      p_tournament_id, v_user_id,
      coalesce(p_payload ->> 'name', ''), coalesce(p_payload ->> 'tournament_identifier', ''),
      coalesce(p_payload ->> 'location', ''),
      case when p_payload ? 'championship_points' and p_payload ->> 'championship_points' is not null then (p_payload ->> 'championship_points')::integer else null end,
      case when p_payload ? 'professor_points' and p_payload ->> 'professor_points' is not null then (p_payload ->> 'professor_points')::integer else null end,
      (p_payload ->> 'date_from')::date, (p_payload ->> 'date_to')::date,
      nullif(p_payload ->> 'linked_deck_id', ''), nullif(p_payload ->> 'linked_deck_list_id', ''),
      coalesce(p_payload ->> 'deck_name', ''), coalesce(p_payload -> 'deck_sprites', '[]'::jsonb),
      coalesce(p_payload ->> 'category', ''), coalesce(p_payload ->> 'placement', ''),
      coalesce(p_payload ->> 'participation', 'player'), nullif(p_payload ->> 'judge_role', ''),
      coalesce(p_payload ->> 'format', ''), coalesce(p_payload ->> 'notes', ''), v_now, v_now
    ) returning * into v_tournament;
  else
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
      raise exception using errcode = 'P0001', message = 'Tournament changed; refresh-and-retry before saving.';
    end if;
    update public.tournaments
    set name = coalesce(p_payload ->> 'name', ''),
        tournament_identifier = coalesce(p_payload ->> 'tournament_identifier', ''),
        location = coalesce(p_payload ->> 'location', ''),
        championship_points = case when p_payload ? 'championship_points' and p_payload ->> 'championship_points' is not null then (p_payload ->> 'championship_points')::integer else null end,
        professor_points = case when p_payload ? 'professor_points' and p_payload ->> 'professor_points' is not null then (p_payload ->> 'professor_points')::integer else null end,
        date_from = (p_payload ->> 'date_from')::date,
        date_to = (p_payload ->> 'date_to')::date,
        linked_deck_id = nullif(p_payload ->> 'linked_deck_id', ''),
        linked_deck_list_id = nullif(p_payload ->> 'linked_deck_list_id', ''),
        deck_name = coalesce(p_payload ->> 'deck_name', ''),
        deck_sprites = coalesce(p_payload -> 'deck_sprites', '[]'::jsonb),
        category = coalesce(p_payload ->> 'category', ''),
        placement = coalesce(p_payload ->> 'placement', ''),
        participation = coalesce(p_payload ->> 'participation', 'player'),
        judge_role = nullif(p_payload ->> 'judge_role', ''),
        format = coalesce(p_payload ->> 'format', ''),
        notes = coalesce(p_payload ->> 'notes', ''),
        updated_at = v_now
    where id = p_tournament_id and user_id = v_user_id
    returning * into v_tournament;
  end if;

  v_result := jsonb_build_object(
    'status', 'committed', 'tournamentId', v_tournament.id,
    'requestId', v_request_id, 'updatedAt', v_tournament.updated_at
  );
  insert into public.tournament_metadata_commands (
    id, user_id, tournament_id, operation, request_id, payload_hash, result
  ) values (
    gen_random_uuid()::text, v_user_id, v_tournament.id, p_operation, v_request_id, v_payload_hash, v_result
  );
  return v_result;
end;
$function$;
revoke all on function public.commit_tournament_metadata(text, text, text, jsonb, timestamptz) from public, anon;
grant execute on function public.commit_tournament_metadata(text, text, text, jsonb, timestamptz) to authenticated;

create or replace function public.create_deck_strategy_from_list(
  p_deck_id text,
  p_request_id text,
  p_deck_list_id text,
  p_payload jsonb,
  p_expected_deck_list_updated_at timestamptz,
  p_tournament_id text default null,
  p_expected_tournament_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_list public.deck_lists%rowtype;
  v_tournament public.tournaments%rowtype;
  v_now timestamptz := clock_timestamp();
  v_legacy_list jsonb;
  v_canonical_sorted jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if nullif(btrim(p_deck_id), '') is null or p_deck_id <> p_request_id then
    raise exception using errcode = '22023', message = 'Strategy id must equal its creation key.';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Strategy payload must be an object.';
  end if;
  select * into v_list from public.deck_lists
  where id = p_deck_list_id and user_id = v_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Deck List could not be found.';
  end if;
  if v_list.deck_id is not null then
    if v_list.deck_id = p_deck_id and exists (select 1 from public.decks where id = p_deck_id and user_id = v_user_id) then
      return jsonb_build_object('status', 'idempotent', 'deckId', p_deck_id, 'deckListId', p_deck_list_id, 'tournamentId', p_tournament_id);
    end if;
    raise exception using errcode = 'P0001', message = 'Deck List already has a different Deck Strategy.';
  end if;
  if p_expected_deck_list_updated_at is null or v_list.updated_at is distinct from p_expected_deck_list_updated_at then
    raise exception using errcode = 'P0001', message = 'Deck List changed; refresh-and-retry before creating its Strategy.';
  end if;
  v_canonical_sorted := public.canonicalize_deck_list_cards(v_list.parsed_cards);
  if exists (select 1 from public.decks where id = p_deck_id) then
    raise exception using errcode = '23505', message = 'That Strategy creation identity is already in use.';
  end if;

  if p_tournament_id is not null then
    select * into v_tournament from public.tournaments
    where id = p_tournament_id and user_id = v_user_id for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Tournament could not be found.';
    end if;
    if p_expected_tournament_updated_at is null or v_tournament.updated_at is distinct from p_expected_tournament_updated_at then
      raise exception using errcode = 'P0001', message = 'Tournament changed; refresh-and-retry before associating its Strategy.';
    end if;
  end if;

  v_legacy_list := jsonb_build_object(
    'id', v_list.id, 'name', v_list.name, 'format', v_list.format, 'date', v_list.date,
    'createdBy', v_list.created_by, 'notes', v_list.notes, 'rawList', v_list.raw_list,
    'parsedCards', v_list.parsed_cards, 'sortedCards', v_canonical_sorted,
    'sortedCardsVersion', 2, 'createdAt', v_list.created_at, 'updatedAt', v_list.updated_at
  );
  insert into public.decks (
    id, user_id, deck_name, archetype_id, format, go_preference, deck_pokemon,
    core_strategy, general_notes, setup_goals, resource_plan, matchups, deck_lists,
    created_at, updated_at
  ) values (
    p_deck_id, v_user_id, coalesce(p_payload ->> 'deckName', v_list.name),
    coalesce(p_payload ->> 'archetypeId', ''), coalesce(p_payload ->> 'format', v_list.format),
    coalesce(p_payload ->> 'goPreference', ''), coalesce(p_payload -> 'deckPokemon', '[]'::jsonb),
    coalesce(p_payload ->> 'coreStrategy', ''), coalesce(p_payload ->> 'generalNotes', ''),
    coalesce(p_payload -> 'setupGoals', '[]'::jsonb), coalesce(p_payload ->> 'resourcePlan', ''),
    coalesce(p_payload -> 'matchups', '[]'::jsonb), jsonb_build_array(v_legacy_list), v_now, v_now
  );
  update public.deck_lists set deck_id = p_deck_id, updated_at = v_now
  where id = p_deck_list_id and user_id = v_user_id;
  if p_tournament_id is not null then
    update public.tournaments set linked_deck_id = p_deck_id, linked_deck_list_id = p_deck_list_id,
      deck_name = coalesce(p_payload ->> 'deckName', v_list.name),
      deck_sprites = coalesce(p_payload -> 'deckPokemon', deck_sprites), updated_at = v_now
    where id = p_tournament_id and user_id = v_user_id;
  end if;
  return jsonb_build_object('status', 'committed', 'deckId', p_deck_id, 'deckListId', p_deck_list_id, 'tournamentId', p_tournament_id);
end;
$function$;
revoke all on function public.create_deck_strategy_from_list(text, text, text, jsonb, timestamptz, text, timestamptz) from public, anon;
grant execute on function public.create_deck_strategy_from_list(text, text, text, jsonb, timestamptz, text, timestamptz) to authenticated;

notify pgrst, 'reload schema';
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
  v_canonical_sorted := public.canonicalize_deck_list_cards(
    coalesce(p_payload -> 'parsedCards', p_payload -> 'parsed_cards')
  );

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
