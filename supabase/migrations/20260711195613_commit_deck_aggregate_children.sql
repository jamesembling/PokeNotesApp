-- Keep each Deck Aggregate write inside one database transaction. The function
-- locks the owned parent row before it reads or mutates the Legacy Deck Copy,
-- then upserts the matching Relational Deck Records before updating the JSON.
-- Any error (including an unresolved historical global-ID collision) rolls the
-- complete function call back.

create or replace function public.commit_deck_aggregate_child(
  p_deck_id text,
  p_kind text,
  p_operation text,
  p_child jsonb,
  p_expected_child_updated_at text,
  p_updated_at timestamptz
)
returns text
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_child_id text;
  v_child_updated_at timestamptz;
  v_current_child jsonb;
  v_current_child_updated_at text;
  v_current_child_updated_at_timestamp timestamptz;
  v_current_children jsonb;
  v_next_children jsonb;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  if nullif(btrim(p_deck_id), '') is null then
    raise exception using
      errcode = '22023',
      message = 'Deck id is required.';
  end if;

  if p_kind is null or p_kind not in ('deck-list', 'matchup') then
    raise exception using
      errcode = '22023',
      message = 'Unsupported deck aggregate child kind.';
  end if;

  if p_operation is null or p_operation not in ('create', 'update') then
    raise exception using
      errcode = '22023',
      message = 'Unsupported deck aggregate operation.';
  end if;

  if p_updated_at is null then
    raise exception using
      errcode = '22023',
      message = 'An update timestamp is required.';
  end if;

  if p_child is null or jsonb_typeof(p_child) is distinct from 'object' then
    raise exception using
      errcode = '22023',
      message = 'Deck aggregate child must be a JSON object.';
  end if;

  v_child_id := p_child ->> 'id';
  if nullif(btrim(v_child_id), '') is null then
    raise exception using
      errcode = '22023',
      message = 'Deck aggregate child id is required.';
  end if;

  if nullif(btrim(coalesce(p_child ->> 'updatedAt', '')), '') is null then
    raise exception using
      errcode = '22023',
      message = 'Deck aggregate child update timestamp is required.';
  end if;

  begin
    v_child_updated_at := (p_child ->> 'updatedAt')::timestamptz;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      raise exception using
        errcode = '22023',
        message = 'Deck aggregate child update timestamp is invalid.';
  end;

  if v_child_updated_at is distinct from p_updated_at then
    raise exception using
      errcode = '22023',
      message = 'Deck aggregate child and commit timestamps must match.';
  end if;

  -- Validate the fields a direct RPC caller could otherwise use to create an
  -- unusable child. Optional notes and planning fields intentionally retain the
  -- application's existing free-text behaviour.
  if p_kind = 'deck-list' then
    if nullif(btrim(coalesce(p_child ->> 'name', '')), '') is null then
      raise exception using
        errcode = '22023',
        message = 'Deck list name is required.';
    end if;

    if nullif(btrim(coalesce(p_child ->> 'rawList', '')), '') is null then
      raise exception using
        errcode = '22023',
        message = 'Deck list text is required.';
    end if;

    if jsonb_typeof(p_child -> 'parsedCards') is distinct from 'array'
      or jsonb_typeof(p_child -> 'sortedCards') is distinct from 'array'
      or jsonb_typeof(p_child -> 'sortedCardsVersion') is distinct from 'number'
    then
      raise exception using
        errcode = '22023',
        message = 'Deck list card data is invalid.';
    end if;
  else
    if nullif(btrim(coalesce(p_child ->> 'deckName', '')), '') is null then
      raise exception using
        errcode = '22023',
        message = 'Matchup deck name is required.';
    end if;

    if nullif(btrim(coalesce(p_child ->> 'format', '')), '') is null then
      raise exception using
        errcode = '22023',
        message = 'Matchup format is required.';
    end if;

    if jsonb_typeof(p_child -> 'deckPokemon') is distinct from 'array' then
      raise exception using
        errcode = '22023',
        message = 'Matchup Pokemon are invalid.';
    end if;

    if jsonb_array_length(p_child -> 'deckPokemon') not between 1 and 2
      or exists (
        select 1
        from jsonb_array_elements(p_child -> 'deckPokemon') as pokemon(value)
        where jsonb_typeof(pokemon.value) <> 'string'
          or nullif(btrim(pokemon.value #>> '{}'), '') is null
      )
    then
      raise exception using
        errcode = '22023',
        message = 'Matchup Pokemon are invalid.';
    end if;

    if coalesce(p_child ->> 'goPreference', '') not in ('', 'First', 'Second') then
      raise exception using
        errcode = '22023',
        message = 'Matchup go preference is invalid.';
    end if;
  end if;

  -- RLS remains active because this is SECURITY INVOKER. The explicit owner
  -- predicate is defense in depth and ensures the locked row is the caller's.
  select case
      when p_kind = 'deck-list' then deck.deck_lists
      else deck.matchups
    end
  into v_current_children
  from public.decks as deck
  where deck.id = p_deck_id
    and deck.user_id = v_user_id
  for update;

  if not found then
    return 'deck-not-found';
  end if;

  if jsonb_typeof(v_current_children) is distinct from 'array' then
    v_current_children := '[]'::jsonb;
  end if;

  -- A same-parent duplicate makes child identity ambiguous. The live audit
  -- currently reports none; fail closed if corruption appears later instead of
  -- replacing or upserting multiple entries with one submitted value.
  if exists (
    select 1
    from jsonb_array_elements(v_current_children) as child(value)
    where jsonb_typeof(child.value) = 'object'
      and coalesce(child.value ->> 'id', '') <> ''
    group by child.value ->> 'id'
    having count(*) > 1
  ) then
    return 'conflict';
  end if;

  select child.value
  into v_current_child
  from jsonb_array_elements(v_current_children)
    with ordinality as child(value, ordinal)
  where child.value ->> 'id' = v_child_id
  order by child.ordinal
  limit 1;

  if p_operation = 'create' then
    -- Generated child IDs should be unique inside one Deck Aggregate. Treat an
    -- unexpected duplicate as a concurrency conflict instead of adding a second
    -- ambiguous child.
    if v_current_child is not null then
      return 'conflict';
    end if;

    if (
      p_kind = 'deck-list'
      and exists (
        select 1
        from public.deck_lists as relational_child
        where relational_child.user_id = v_user_id
          and relational_child.deck_id = p_deck_id
          and relational_child.id = v_child_id
      )
    ) or (
      p_kind = 'matchup'
      and exists (
        select 1
        from public.deck_matchups as relational_child
        where relational_child.user_id = v_user_id
          and relational_child.deck_id = p_deck_id
          and relational_child.id = v_child_id
      )
    ) then
      return 'conflict';
    end if;

    if p_kind = 'deck-list' then
      v_next_children := jsonb_build_array(p_child) || v_current_children;
    else
      v_next_children := v_current_children || jsonb_build_array(p_child);
    end if;
  else
    if v_current_child is null then
      return 'child-not-found';
    end if;

    v_current_child_updated_at := coalesce(
      nullif(v_current_child ->> 'updatedAt', ''),
      v_current_child ->> 'updated_at',
      ''
    );

    -- Updates carry the version observed by the editor. This prevents two tabs
    -- editing the same child from silently replacing one another. Updates to
    -- different children remain merge-safe because the parent is re-read after
    -- its row lock is acquired.
    if p_expected_child_updated_at is null
      or v_current_child_updated_at <> p_expected_child_updated_at
    then
      return 'conflict';
    end if;

    if v_current_child_updated_at <> '' then
      begin
        v_current_child_updated_at_timestamp := v_current_child_updated_at::timestamptz;
      exception
        when invalid_datetime_format or datetime_field_overflow then
          return 'conflict';
      end;

      if p_updated_at <= v_current_child_updated_at_timestamp then
        return 'conflict';
      end if;
    end if;

    select coalesce(
      jsonb_agg(
        case
          when child.value ->> 'id' = v_child_id then p_child
          else child.value
        end
        order by child.ordinal
      ),
      '[]'::jsonb
    )
    into v_next_children
    from jsonb_array_elements(v_current_children)
      with ordinality as child(value, ordinal);
  end if;

  if p_kind = 'deck-list' then
    insert into public.deck_lists (
      id,
      user_id,
      deck_id,
      name,
      format,
      date,
      created_by,
      notes,
      raw_list,
      parsed_cards,
      sorted_cards,
      sorted_cards_version,
      position,
      created_at,
      updated_at
    )
    select
      child.value ->> 'id',
      v_user_id,
      p_deck_id,
      coalesce(child.value ->> 'name', ''),
      coalesce(child.value ->> 'format', ''),
      coalesce(child.value ->> 'date', ''),
      coalesce(
        nullif(child.value ->> 'createdBy', ''),
        child.value ->> 'created_by',
        ''
      ),
      coalesce(child.value ->> 'notes', ''),
      coalesce(
        nullif(child.value ->> 'rawList', ''),
        child.value ->> 'raw_list',
        ''
      ),
      case
        when jsonb_typeof(child.value -> 'parsedCards') = 'array'
          then child.value -> 'parsedCards'
        else coalesce(
          nullif(child.value -> 'parsed_cards', 'null'::jsonb),
          '[]'::jsonb
        )
      end,
      case
        when jsonb_typeof(child.value -> 'sortedCards') = 'array'
          then child.value -> 'sortedCards'
        else coalesce(
          nullif(child.value -> 'sorted_cards', 'null'::jsonb),
          '[]'::jsonb
        )
      end,
      case
        when jsonb_typeof(child.value -> 'sortedCardsVersion') = 'number'
          then (child.value ->> 'sortedCardsVersion')::integer
        when jsonb_typeof(child.value -> 'sorted_cards_version') = 'number'
          then (child.value ->> 'sorted_cards_version')::integer
        else null
      end,
      child.ordinal::integer - 1,
      coalesce(
        nullif(child.value ->> 'createdAt', ''),
        nullif(child.value ->> 'created_at', ''),
        nullif(child.value ->> 'updatedAt', ''),
        nullif(child.value ->> 'updated_at', ''),
        p_updated_at::text
      )::timestamptz,
      coalesce(
        nullif(child.value ->> 'updatedAt', ''),
        nullif(child.value ->> 'updated_at', ''),
        p_updated_at::text
      )::timestamptz
    from jsonb_array_elements(v_next_children)
      with ordinality as child(value, ordinal)
    where jsonb_typeof(child.value) = 'object'
      and coalesce(child.value ->> 'id', '') <> ''
      and coalesce(child.value ->> 'name', '') <> ''
    on conflict (user_id, deck_id, id)
    do update set
      name = excluded.name,
      format = excluded.format,
      date = excluded.date,
      created_by = excluded.created_by,
      notes = excluded.notes,
      raw_list = excluded.raw_list,
      parsed_cards = excluded.parsed_cards,
      sorted_cards = excluded.sorted_cards,
      sorted_cards_version = excluded.sorted_cards_version,
      position = excluded.position,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at;

    update public.decks as deck
    set
      deck_lists = v_next_children,
      updated_at = p_updated_at
    where deck.id = p_deck_id
      and deck.user_id = v_user_id;
  else
    insert into public.deck_matchups (
      id,
      user_id,
      deck_id,
      deck_name,
      deck_pokemon,
      format,
      go_preference,
      matchup_favor,
      ideal_bench,
      techs_needed,
      matchup_plan,
      position,
      created_at,
      updated_at
    )
    select
      child.value ->> 'id',
      v_user_id,
      p_deck_id,
      coalesce(
        nullif(child.value ->> 'deckName', ''),
        child.value ->> 'deck_name',
        ''
      ),
      case
        when jsonb_typeof(child.value -> 'deckPokemon') = 'array'
          then child.value -> 'deckPokemon'
        else coalesce(
          nullif(child.value -> 'deck_pokemon', 'null'::jsonb),
          '[]'::jsonb
        )
      end,
      coalesce(child.value ->> 'format', ''),
      case coalesce(
        nullif(child.value ->> 'goPreference', ''),
        child.value ->> 'go_preference',
        ''
      )
        when 'First' then 'First'
        when 'Second' then 'Second'
        else ''
      end,
      coalesce(
        nullif(child.value ->> 'matchupFavor', ''),
        child.value ->> 'matchup_favor',
        ''
      ),
      coalesce(
        nullif(child.value ->> 'idealBench', ''),
        child.value ->> 'ideal_bench',
        ''
      ),
      coalesce(
        nullif(child.value ->> 'techsNeeded', ''),
        child.value ->> 'techs_needed',
        ''
      ),
      coalesce(
        nullif(child.value ->> 'matchupPlan', ''),
        child.value ->> 'matchup_plan',
        ''
      ),
      child.ordinal::integer - 1,
      coalesce(
        nullif(child.value ->> 'createdAt', ''),
        nullif(child.value ->> 'created_at', ''),
        p_updated_at::text
      )::timestamptz,
      coalesce(
        nullif(child.value ->> 'updatedAt', ''),
        nullif(child.value ->> 'updated_at', ''),
        p_updated_at::text
      )::timestamptz
    from jsonb_array_elements(v_next_children)
      with ordinality as child(value, ordinal)
    where jsonb_typeof(child.value) = 'object'
      and coalesce(child.value ->> 'id', '') <> ''
      and coalesce(
        nullif(child.value ->> 'deckName', ''),
        child.value ->> 'deck_name',
        ''
      ) <> ''
    on conflict (user_id, deck_id, id)
    do update set
      deck_name = excluded.deck_name,
      deck_pokemon = excluded.deck_pokemon,
      format = excluded.format,
      go_preference = excluded.go_preference,
      matchup_favor = excluded.matchup_favor,
      ideal_bench = excluded.ideal_bench,
      techs_needed = excluded.techs_needed,
      matchup_plan = excluded.matchup_plan,
      position = excluded.position,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at;

    update public.decks as deck
    set
      matchups = v_next_children,
      updated_at = p_updated_at
    where deck.id = p_deck_id
      and deck.user_id = v_user_id;
  end if;

  return 'committed';
end;
$function$;

comment on function public.commit_deck_aggregate_child(
  text,
  text,
  text,
  jsonb,
  text,
  timestamptz
) is
  'Atomically locks and updates one owned Deck Aggregate child in both compatibility stores.';

revoke all on function public.commit_deck_aggregate_child(
  text,
  text,
  text,
  jsonb,
  text,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.commit_deck_aggregate_child(
  text,
  text,
  text,
  jsonb,
  text,
  timestamptz
) to authenticated;

notify pgrst, 'reload schema';
