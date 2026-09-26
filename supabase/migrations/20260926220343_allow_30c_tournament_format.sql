-- Expand the Tournament format allowlist before deploying the 30th Celebration app default.
-- The prior and updated application versions remain compatible with this function.

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
    'TEF-30C', 'TEF-PBL', 'TEF-CRI', 'TEF-POR', 'SVI-ASC', 'SVI-PFL', 'SVI-MEG',
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
