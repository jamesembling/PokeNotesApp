-- Tournament deck-list capture is one tenant-scoped transaction.  The
-- snapshot is a complete, immutable evidence record; source Deck Lists may
-- be removed later without changing tournament history.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table public.tournament_deck_list_snapshots (
  id                    text primary key,
  tournament_id         text not null references public.tournaments(id) on delete cascade,
  user_id               uuid not null references auth.users(id) on delete cascade,
  source_deck_id        text,
  source_deck_list_id   text,
  request_id            text not null,
  payload_hash          text not null,
  name                  text not null default '',
  format                text not null default '',
  date                  text not null default '',
  created_by            text not null default '',
  notes                 text not null default '',
  raw_list              text not null default '',
  parsed_cards          jsonb not null default '[]',
  sorted_cards          jsonb not null default '[]',
  sorted_cards_version  integer not null,
  created_at            timestamptz not null default now(),

  constraint tournament_deck_list_snapshots_one_per_tournament
    unique (user_id, tournament_id),
  constraint tournament_deck_list_snapshots_request_unique
    unique (user_id, request_id)
);

create table public.tournament_deck_list_commands (
  id             text primary key,
  tournament_id  text not null references public.tournaments(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  operation      text not null check (operation in ('capture', 'remove')),
  request_id     text not null,
  payload_hash   text not null,
  result         jsonb not null,
  created_at     timestamptz not null default now(),
  constraint tournament_deck_list_commands_request_unique
    unique (user_id, operation, request_id)
);

comment on table public.tournament_deck_list_snapshots is
  'Immutable account-owned evidence of the Deck List used for a Tournament. The source row is optional and never required for display.';
comment on column public.tournament_deck_list_snapshots.payload_hash is
  'Canonical request fingerprint used to make a retried request idempotent and reject conflicting request-id reuse.';

alter table public.tournament_deck_list_snapshots enable row level security;
alter table public.tournament_deck_list_commands enable row level security;

create policy "Users can view own Tournament Deck List snapshots"
  on public.tournament_deck_list_snapshots
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.tournament_deck_list_snapshots from anon, authenticated;
grant select on public.tournament_deck_list_snapshots to authenticated;
grant all on public.tournament_deck_list_snapshots to service_role;
revoke all on public.tournament_deck_list_commands from anon, authenticated;
grant all on public.tournament_deck_list_commands to service_role;

-- Keep this API explicitly write-only through the reviewed transaction below;
-- authenticated clients receive no direct INSERT/UPDATE/DELETE privileges.
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
    'createDeckList', p_create_deck_list
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
        'sortedCards', coalesce(p_payload -> 'sortedCards', p_payload -> 'sorted_cards'),
        'sortedCardsVersion', coalesce(p_payload -> 'sortedCardsVersion', p_payload -> 'sorted_cards_version')
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
        coalesce(p_payload -> 'sortedCards', p_payload -> 'sorted_cards'),
        coalesce((p_payload ->> 'sortedCardsVersion')::integer, (p_payload ->> 'sorted_cards_version')::integer),
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
  set linked_deck_id = v_source_deck_id,
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

create or replace function public.remove_tournament_deck_list(
  p_tournament_id text,
  p_expected_tournament_updated_at timestamptz,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_tournament public.tournaments%rowtype;
  v_command public.tournament_deck_list_commands%rowtype;
  v_request_id text := nullif(btrim(p_request_id), '');
  v_payload_hash text;
  v_result jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if v_request_id is null then
    raise exception using errcode = '22023', message = 'A Tournament removal request id is required.';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':tournament-deck-list-remove:' || v_request_id, 0)
  );
  v_payload_hash := md5(jsonb_build_object('tournamentId', p_tournament_id, 'operation', 'remove')::text);
  select * into v_command from public.tournament_deck_list_commands
  where user_id = v_user_id and operation = 'remove' and request_id = v_request_id
  for update;
  if found then
    if v_command.payload_hash <> v_payload_hash then
      raise exception using errcode = '23505', message = 'That Tournament removal request id was already used with different values.';
    end if;
    return jsonb_set(v_command.result, '{status}', '"idempotent"'::jsonb);
  end if;
  select * into v_tournament from public.tournaments
  where id = p_tournament_id and user_id = v_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Tournament could not be found.';
  end if;
  if p_expected_tournament_updated_at is null
    or v_tournament.updated_at is distinct from p_expected_tournament_updated_at
  then
    raise exception using errcode = 'P0001', message = 'Tournament changed; refresh-and-retry before removing its Deck List.';
  end if;
  delete from public.tournament_deck_list_snapshots
  where user_id = v_user_id and tournament_id = p_tournament_id;
  update public.tournaments
  set linked_deck_list_id = null, updated_at = v_now
  where id = p_tournament_id and user_id = v_user_id;
  v_result := jsonb_build_object('status', 'committed', 'tournamentId', p_tournament_id);
  insert into public.tournament_deck_list_commands (
    id, tournament_id, user_id, operation, request_id, payload_hash, result
  ) values (
    gen_random_uuid()::text, p_tournament_id, v_user_id, 'remove', v_request_id, v_payload_hash, v_result
  );
  return v_result;
end;
$function$;
revoke all on function public.remove_tournament_deck_list(text, timestamptz, text) from public, anon;
grant execute on function public.remove_tournament_deck_list(text, timestamptz, text) to authenticated;

-- Keep the previous application compatible during the migration/application
-- rollout. The old overload receives a fresh command identity because the
-- previous client had no request-id field.
create or replace function public.remove_tournament_deck_list(
  p_tournament_id text,
  p_expected_tournament_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  return public.remove_tournament_deck_list(
    p_tournament_id,
    p_expected_tournament_updated_at,
    gen_random_uuid()::text
  );
end;
$function$;
revoke all on function public.remove_tournament_deck_list(text, timestamptz) from public, anon;
grant execute on function public.remove_tournament_deck_list(text, timestamptz) to authenticated;

-- Round allocation keeps the existing parent-row lock while making a retry of
-- the same UI submission return the original round instead of allocating a
-- second number.
alter table public.tournament_rounds
  add column if not exists creation_key text;
create unique index if not exists tournament_rounds_user_creation_key_unique
  on public.tournament_rounds (user_id, creation_key)
  where creation_key is not null;

create or replace function public.create_tournament_round_idempotent(
  p_tournament_id text,
  p_round_id text,
  p_creation_key text,
  p_opponent_deck_name text,
  p_opponent_deck_sprites jsonb,
  p_result text,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_existing public.tournament_rounds%rowtype;
  v_round_number integer;
  v_fingerprint text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if nullif(btrim(p_tournament_id), '') is null
    or nullif(btrim(p_round_id), '') is null
    or nullif(btrim(p_creation_key), '') is null
    or nullif(btrim(p_result), '') is null
  then
    raise exception using errcode = '22023', message = 'Tournament round input is incomplete.';
  end if;
  if p_opponent_deck_sprites is null
    or jsonb_typeof(p_opponent_deck_sprites) is distinct from 'array'
    or jsonb_array_length(p_opponent_deck_sprites) > 2
  then
    raise exception using errcode = '22023', message = 'Opponent Pokemon are invalid.';
  end if;

  perform 1 from public.tournaments
    where id = p_tournament_id and user_id = v_user_id
    for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Tournament could not be found.';
  end if;

  v_fingerprint := md5(jsonb_build_object(
    'tournamentId', p_tournament_id,
    'opponentDeckName', coalesce(p_opponent_deck_name, ''),
    'opponentDeckSprites', p_opponent_deck_sprites,
    'result', p_result,
    'notes', coalesce(p_notes, '')
  )::text);
  select * into v_existing
  from public.tournament_rounds
  where user_id = v_user_id and creation_key = p_creation_key
  for update;
  if found then
    if md5(jsonb_build_object(
        'tournamentId', v_existing.tournament_id,
        'opponentDeckName', v_existing.opponent_deck_name,
        'opponentDeckSprites', v_existing.opponent_deck_sprites,
        'result', v_existing.result,
        'notes', v_existing.notes
      )::text) <> v_fingerprint
    then
      raise exception using errcode = '23505', message = 'That Tournament round request id was already used with different values.';
    end if;
    return jsonb_build_object('status', 'idempotent', 'roundId', v_existing.id, 'roundNumber', v_existing.round_number);
  end if;

  select coalesce(max(round_number), 0) + 1 into v_round_number
  from public.tournament_rounds
  where tournament_id = p_tournament_id and user_id = v_user_id;
  insert into public.tournament_rounds (
    id, tournament_id, user_id, creation_key, round_number,
    opponent_deck_name, opponent_deck_sprites, result, notes
  ) values (
    p_round_id, p_tournament_id, v_user_id, p_creation_key, v_round_number,
    coalesce(p_opponent_deck_name, ''), p_opponent_deck_sprites, p_result, coalesce(p_notes, '')
  );
  return jsonb_build_object('status', 'committed', 'roundId', p_round_id, 'roundNumber', v_round_number);
end;
$function$;

revoke all on function public.create_tournament_round_idempotent(
  text, text, text, text, jsonb, text, text
) from public, anon;
grant execute on function public.create_tournament_round_idempotent(
  text, text, text, text, jsonb, text, text
) to authenticated;

notify pgrst, 'reload schema';
