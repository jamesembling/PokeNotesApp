-- Preserve Strategy-from-list creation identities independently of mutable
-- Deck, Deck List, and Tournament rows. A request key may be replayed after
-- a later compatible edit or deletion, but it may not be reused for a new
-- payload.
create table if not exists public.deck_strategy_commands (
  id             text primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  deck_id        text not null,
  deck_list_id   text not null,
  request_id     text not null,
  payload_hash   text not null,
  result         jsonb not null,
  created_at     timestamptz not null default now(),
  constraint deck_strategy_commands_request_unique unique (user_id, request_id)
);

comment on table public.deck_strategy_commands is
  'Durable idempotency history for first-class Strategy creation from a Deck List.';

alter table public.deck_strategy_commands enable row level security;
revoke all on public.deck_strategy_commands from anon, authenticated;
grant all on public.deck_strategy_commands to service_role;

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
  v_command public.deck_strategy_commands%rowtype;
  v_list public.deck_lists%rowtype;
  v_deck public.decks%rowtype;
  v_tournament public.tournaments%rowtype;
  v_now timestamptz := clock_timestamp();
  v_request_id text := nullif(btrim(p_request_id), '');
  v_payload_hash text;
  v_result jsonb;
  v_legacy_list jsonb;
  v_canonical_sorted jsonb;
  v_adoption_committed boolean := false;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if v_request_id is null or nullif(btrim(p_deck_id), '') is null or p_deck_id <> v_request_id then
    raise exception using errcode = '22023', message = 'Strategy id must equal its creation key.';
  end if;
  if length(v_request_id) > 200 then
    raise exception using errcode = '22023', message = 'Strategy creation key is too long.';
  end if;
  if nullif(btrim(p_deck_list_id), '') is null then
    raise exception using errcode = '22023', message = 'Deck List id is required.';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Strategy payload must be an object.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':deck-strategy-create:' || v_request_id, 0)
  );
  v_payload_hash := md5(jsonb_build_object(
    'deckId', p_deck_id,
    'deckListId', p_deck_list_id,
    'tournamentId', p_tournament_id,
    'payload', p_payload
  )::text);

  -- Replay identity is checked before mutable ownership/state lookups. This
  -- keeps an exact retry idempotent after a later compatible edit or delete,
  -- while initial commands still validate the current owned list below.
  select * into v_command
  from public.deck_strategy_commands
  where user_id = v_user_id and request_id = v_request_id
  for update;
  if found then
    if v_command.payload_hash <> v_payload_hash then
      raise exception using errcode = '23505', message = 'That Strategy creation identity was already used with different values.';
    end if;
    return jsonb_set(v_command.result, '{status}', '"idempotent"'::jsonb);
  end if;

  select * into v_list
  from public.deck_lists
  where id = p_deck_list_id and user_id = v_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Deck List could not be found.';
  end if;
  if v_list.deck_id is not null then
    if v_list.deck_id <> p_deck_id then
      raise exception using errcode = 'P0001', message = 'Deck List already has a different Deck Strategy.';
    end if;
    -- Rows created before this ledger existed can be adopted only when every
    -- persisted Strategy field agrees with the requested payload. A matching
    -- legacy state is recorded as history; a changed payload is a conflict.
    select * into v_deck from public.decks
    where id = p_deck_id and user_id = v_user_id;
    if found then
      if v_deck.deck_name is distinct from coalesce(p_payload ->> 'deckName', v_list.name)
        or v_deck.format is distinct from coalesce(p_payload ->> 'format', v_list.format)
        or v_deck.archetype_id is distinct from coalesce(p_payload ->> 'archetypeId', '')
        or v_deck.deck_pokemon is distinct from coalesce(p_payload -> 'deckPokemon', '[]'::jsonb)
        or v_deck.go_preference is distinct from coalesce(p_payload ->> 'goPreference', '')
        or v_deck.core_strategy is distinct from coalesce(p_payload ->> 'coreStrategy', '')
        or v_deck.general_notes is distinct from coalesce(p_payload ->> 'generalNotes', '')
        or v_deck.setup_goals is distinct from coalesce(p_payload -> 'setupGoals', '[]'::jsonb)
        or v_deck.resource_plan is distinct from coalesce(p_payload ->> 'resourcePlan', '')
        or v_deck.matchups is distinct from coalesce(p_payload -> 'matchups', '[]'::jsonb)
      then
        raise exception using errcode = '23505', message = 'That Strategy creation identity was already used with different values.';
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
        update public.tournaments set linked_deck_id = p_deck_id, linked_deck_list_id = p_deck_list_id,
          deck_name = coalesce(p_payload ->> 'deckName', v_list.name),
          deck_sprites = coalesce(p_payload -> 'deckPokemon', deck_sprites), updated_at = v_now
        where id = p_tournament_id and user_id = v_user_id;
        v_adoption_committed := true;
      end if;
      v_result := jsonb_build_object(
        'status', 'committed', 'deckId', p_deck_id, 'deckListId', p_deck_list_id, 'tournamentId', p_tournament_id
      );
      insert into public.deck_strategy_commands (
        id, user_id, deck_id, deck_list_id, request_id, payload_hash, result
      ) values (
        gen_random_uuid()::text, v_user_id, p_deck_id, p_deck_list_id, v_request_id, v_payload_hash, v_result
      );
      return case when v_adoption_committed
        then v_result
        else jsonb_set(v_result, '{status}', '"idempotent"'::jsonb)
      end;
    end if;
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
  v_result := jsonb_build_object('status', 'committed', 'deckId', p_deck_id, 'deckListId', p_deck_list_id, 'tournamentId', p_tournament_id);
  insert into public.deck_strategy_commands (
    id, user_id, deck_id, deck_list_id, request_id, payload_hash, result
  ) values (
    gen_random_uuid()::text, v_user_id, p_deck_id, p_deck_list_id, v_request_id, v_payload_hash, v_result
  );
  return v_result;
end;
$function$;

revoke all on function public.create_deck_strategy_from_list(text, text, text, jsonb, timestamptz, text, timestamptz) from public, anon;
grant execute on function public.create_deck_strategy_from_list(text, text, text, jsonb, timestamptz, text, timestamptz) to authenticated;

notify pgrst, 'reload schema';
