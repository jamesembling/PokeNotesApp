-- Preserve both account-scoped copies of historical Deck Aggregate children
-- whose old IDs were incorrectly treated as globally unique. This repair is
-- intentionally data-derived: it hardcodes no production identifiers, locks
-- every involved table before deriving the mapping, and aborts unless the
-- reviewed 19-list/one-matchup/31-link snapshot is still exact.
--
-- The old-to-new mapping is retained in the private schema through the agreed
-- 30-day compatibility period. It is operational evidence, not an application
-- API, and carries no names, notes, cards, or Battle Log content.

set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $repair$
declare
  v_list_count integer;
  v_matchup_count integer;
  v_parent_count integer;
  v_target_log_count integer;
  v_untouched_log_count integer;
  v_target_tournament_count integer;
  v_row_count integer;
begin
  -- SHARE ROW EXCLUSIVE blocks concurrent application writes while permitting
  -- ordinary reads throughout this short, bounded repair.
  execute 'lock table public.decks, public.deck_lists, public.deck_matchups, public.logs, public.tournaments in share row exclusive mode';

  execute $ddl$
    create table if not exists private.deck_aggregate_rekey_ledger (
      kind text not null check (kind in ('deck-list', 'matchup')),
      user_id uuid not null,
      deck_id text not null,
      old_id text not null,
      new_id text not null,
      repaired_at timestamptz not null,
      compatibility_until timestamptz not null,
      primary key (kind, user_id, deck_id, old_id),
      unique (kind, new_id)
    )
  $ddl$;
  execute 'alter table private.deck_aggregate_rekey_ledger enable row level security';
  execute 'revoke all privileges on table private.deck_aggregate_rekey_ledger from public, anon, authenticated, service_role';

  if exists (select 1 from private.deck_aggregate_rekey_ledger) then
    raise exception 'Deck Aggregate re-key ledger is not empty; refusing to replay repair.';
  end if;

  execute $ddl$
    create temporary table deck_aggregate_rekey_map (
      kind text not null check (kind in ('deck-list', 'matchup')),
      user_id uuid not null,
      deck_id text not null,
      old_id text not null,
      new_id text not null,
      position integer not null,
      child jsonb not null,
      primary key (kind, user_id, deck_id, old_id),
      unique (kind, new_id)
    ) on commit drop
  $ddl$;

  insert into pg_temp.deck_aggregate_rekey_map (
    kind,
    user_id,
    deck_id,
    old_id,
    new_id,
    position,
    child
  )
  select
    'deck-list',
    deck.user_id,
    deck.id,
    child.value ->> 'id',
    gen_random_uuid()::text,
    child.ordinality::integer - 1,
    child.value
  from public.decks as deck
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(deck.deck_lists) = 'array' then deck.deck_lists
      else '[]'::jsonb
    end
  ) with ordinality as child(value, ordinality)
  where coalesce(child.value ->> 'id', '') <> ''
    and not exists (
      select 1
      from public.deck_lists as same_parent
      where same_parent.user_id = deck.user_id
        and same_parent.deck_id = deck.id
        and same_parent.id = child.value ->> 'id'
    )
    and exists (
      select 1
      from public.deck_lists as occupied
      where occupied.id = child.value ->> 'id'
        and (occupied.user_id, occupied.deck_id) <> (deck.user_id, deck.id)
    );
  get diagnostics v_list_count = row_count;

  insert into pg_temp.deck_aggregate_rekey_map (
    kind,
    user_id,
    deck_id,
    old_id,
    new_id,
    position,
    child
  )
  select
    'matchup',
    deck.user_id,
    deck.id,
    child.value ->> 'id',
    gen_random_uuid()::text,
    child.ordinality::integer - 1,
    child.value
  from public.decks as deck
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(deck.matchups) = 'array' then deck.matchups
      else '[]'::jsonb
    end
  ) with ordinality as child(value, ordinality)
  where coalesce(child.value ->> 'id', '') <> ''
    and not exists (
      select 1
      from public.deck_matchups as same_parent
      where same_parent.user_id = deck.user_id
        and same_parent.deck_id = deck.id
        and same_parent.id = child.value ->> 'id'
    )
    and exists (
      select 1
      from public.deck_matchups as occupied
      where occupied.id = child.value ->> 'id'
        and (occupied.user_id, occupied.deck_id) <> (deck.user_id, deck.id)
    );
  get diagnostics v_matchup_count = row_count;

  select count(distinct (mapping.user_id, mapping.deck_id))
  into v_parent_count
  from pg_temp.deck_aggregate_rekey_map as mapping;

  if v_list_count <> 19 or v_matchup_count <> 1 or v_parent_count <> 11 then
    raise exception
      'Deck Aggregate re-key preflight changed (lists %, matchups %, parents %).',
      v_list_count,
      v_matchup_count,
      v_parent_count;
  end if;

  if (
    select count(distinct old_id)
    from pg_temp.deck_aggregate_rekey_map
    where kind = 'deck-list'
  ) <> 19 then
    raise exception 'Deck List collision IDs are no longer the reviewed 19 distinct IDs.';
  end if;

  if exists (
    select 1
    from pg_temp.deck_aggregate_rekey_map as mapping
    where jsonb_typeof(mapping.child) is distinct from 'object'
      or (
        mapping.kind = 'deck-list'
        and (
          coalesce(mapping.child ->> 'name', '') = ''
          or coalesce(mapping.child ->> 'rawList', mapping.child ->> 'raw_list', '') = ''
          or jsonb_typeof(coalesce(
            nullif(mapping.child -> 'parsedCards', 'null'::jsonb),
            nullif(mapping.child -> 'parsed_cards', 'null'::jsonb),
            '[]'::jsonb
          )) is distinct from 'array'
          or jsonb_typeof(coalesce(
            nullif(mapping.child -> 'sortedCards', 'null'::jsonb),
            nullif(mapping.child -> 'sorted_cards', 'null'::jsonb),
            '[]'::jsonb
          )) is distinct from 'array'
          or coalesce(mapping.child ->> 'createdAt', mapping.child ->> 'created_at', '') = ''
          or coalesce(mapping.child ->> 'updatedAt', mapping.child ->> 'updated_at', '') = ''
        )
      )
      or (
        mapping.kind = 'matchup'
        and (
          coalesce(mapping.child ->> 'deckName', mapping.child ->> 'deck_name', '') = ''
          or coalesce(mapping.child ->> 'format', '') = ''
          or jsonb_typeof(coalesce(
            nullif(mapping.child -> 'deckPokemon', 'null'::jsonb),
            nullif(mapping.child -> 'deck_pokemon', 'null'::jsonb),
            '[]'::jsonb
          )) is distinct from 'array'
          or coalesce(mapping.child ->> 'createdAt', mapping.child ->> 'created_at', '') = ''
          or coalesce(mapping.child ->> 'updatedAt', mapping.child ->> 'updated_at', '') = ''
        )
      )
  ) then
    raise exception 'A collision payload no longer satisfies the reviewed shape.';
  end if;

  -- UUID generation is collision-resistant, but fail closed instead of relying
  -- on probability if a generated ID is already present in either store.
  if exists (
    select 1
    from pg_temp.deck_aggregate_rekey_map as mapping
    where (
      mapping.kind = 'deck-list'
      and (
        exists (select 1 from public.deck_lists where id = mapping.new_id)
        or exists (
          select 1
          from public.decks as deck
          cross join lateral jsonb_array_elements(
            case when jsonb_typeof(deck.deck_lists) = 'array' then deck.deck_lists else '[]'::jsonb end
          ) as child(value)
          where child.value ->> 'id' = mapping.new_id
        )
      )
    )
    or (
      mapping.kind = 'matchup'
      and (
        exists (select 1 from public.deck_matchups where id = mapping.new_id)
        or exists (
          select 1
          from public.decks as deck
          cross join lateral jsonb_array_elements(
            case when jsonb_typeof(deck.matchups) = 'array' then deck.matchups else '[]'::jsonb end
          ) as child(value)
          where child.value ->> 'id' = mapping.new_id
        )
      )
    )
  ) then
    raise exception 'A generated Deck Aggregate ID already exists; retry with a fresh mapping.';
  end if;

  select count(*)
  into v_target_log_count
  from public.logs as log
  join pg_temp.deck_aggregate_rekey_map as mapping
    on mapping.kind = 'deck-list'
    and (log.user_id, log.linked_deck_id, log.linked_deck_list_id) =
      (mapping.user_id, mapping.deck_id, mapping.old_id);

  select count(*)
  into v_untouched_log_count
  from public.logs as log
  where log.linked_deck_list_id in (
    select old_id
    from pg_temp.deck_aggregate_rekey_map
    where kind = 'deck-list'
  )
    and not exists (
      select 1
      from pg_temp.deck_aggregate_rekey_map as mapping
      where mapping.kind = 'deck-list'
        and (log.user_id, log.linked_deck_id, log.linked_deck_list_id) =
          (mapping.user_id, mapping.deck_id, mapping.old_id)
    );

  select count(*)
  into v_target_tournament_count
  from public.tournaments as tournament
  join pg_temp.deck_aggregate_rekey_map as mapping
    on mapping.kind = 'deck-list'
    and (
      tournament.user_id,
      tournament.linked_deck_id,
      tournament.linked_deck_list_id
    ) = (mapping.user_id, mapping.deck_id, mapping.old_id);

  if v_target_log_count <> 31
    or v_untouched_log_count <> 43
    or v_target_tournament_count <> 0
  then
    raise exception
      'Deck List link preflight changed (target logs %, untouched logs %, tournaments %).',
      v_target_log_count,
      v_untouched_log_count,
      v_target_tournament_count;
  end if;

  if (
    select count(*)
    from pg_catalog.pg_trigger as trigger
    join pg_catalog.pg_class as relation on relation.oid = trigger.tgrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and (relation.relname, trigger.tgname) in (
        ('decks', 'set_decks_updated_at'),
        ('logs', 'set_logs_updated_at')
      )
      and trigger.tgenabled = 'O'
  ) <> 2 then
    raise exception 'Expected timestamp-preservation triggers are not enabled.';
  end if;

  execute $ddl$
    create temporary table deck_aggregate_parent_snapshot on commit drop as
    select deck.user_id, deck.id as deck_id, to_jsonb(deck) as row_data
    from public.decks as deck
    where exists (
      select 1
      from pg_temp.deck_aggregate_rekey_map as mapping
      where (mapping.user_id, mapping.deck_id) = (deck.user_id, deck.id)
    )
  $ddl$;

  execute $ddl$
    create temporary table deck_aggregate_target_log_snapshot on commit drop as
    select log.id, to_jsonb(log) as row_data
    from public.logs as log
    where exists (
      select 1
      from pg_temp.deck_aggregate_rekey_map as mapping
      where mapping.kind = 'deck-list'
        and (log.user_id, log.linked_deck_id, log.linked_deck_list_id) =
          (mapping.user_id, mapping.deck_id, mapping.old_id)
    )
  $ddl$;

  execute $ddl$
    create temporary table deck_aggregate_untouched_log_snapshot on commit drop as
    select log.id, to_jsonb(log) as row_data
    from public.logs as log
    where log.linked_deck_list_id in (
      select old_id from pg_temp.deck_aggregate_rekey_map where kind = 'deck-list'
    )
      and not exists (
        select 1
        from pg_temp.deck_aggregate_rekey_map as mapping
        where mapping.kind = 'deck-list'
          and (log.user_id, log.linked_deck_id, log.linked_deck_list_id) =
            (mapping.user_id, mapping.deck_id, mapping.old_id)
      )
  $ddl$;

  execute $ddl$
    create temporary table deck_aggregate_occupied_snapshot on commit drop as
    select 'deck-list'::text as kind, row.id, to_jsonb(row) as row_data
    from public.deck_lists as row
    where row.id in (
      select old_id from pg_temp.deck_aggregate_rekey_map where kind = 'deck-list'
    )
    union all
    select 'matchup', row.id, to_jsonb(row)
    from public.deck_matchups as row
    where row.id in (
      select old_id from pg_temp.deck_aggregate_rekey_map where kind = 'matchup'
    )
  $ddl$;

  if (select count(*) from pg_temp.deck_aggregate_parent_snapshot) <> 11
    or (select count(*) from pg_temp.deck_aggregate_target_log_snapshot) <> 31
    or (select count(*) from pg_temp.deck_aggregate_untouched_log_snapshot) <> 43
    or (select count(*) from pg_temp.deck_aggregate_occupied_snapshot) <> 20
  then
    raise exception 'Deck Aggregate repair snapshots do not match the reviewed scope.';
  end if;

  insert into private.deck_aggregate_rekey_ledger (
    kind,
    user_id,
    deck_id,
    old_id,
    new_id,
    repaired_at,
    compatibility_until
  )
  select
    mapping.kind,
    mapping.user_id,
    mapping.deck_id,
    mapping.old_id,
    mapping.new_id,
    statement_timestamp(),
    statement_timestamp() + interval '30 days'
  from pg_temp.deck_aggregate_rekey_map as mapping;

  alter table public.decks disable trigger set_decks_updated_at;
  alter table public.logs disable trigger set_logs_updated_at;

  update public.decks as deck
  set deck_lists = rewritten.children
  from (
    select
      snapshot.user_id,
      snapshot.deck_id,
      jsonb_agg(
        case
          when mapping.new_id is null then child.value
          else jsonb_set(child.value, '{id}', to_jsonb(mapping.new_id), false)
        end
        order by child.ordinality
      ) as children
    from pg_temp.deck_aggregate_parent_snapshot as snapshot
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(snapshot.row_data -> 'deck_lists') = 'array'
          then snapshot.row_data -> 'deck_lists'
        else '[]'::jsonb
      end
    ) with ordinality as child(value, ordinality)
    left join pg_temp.deck_aggregate_rekey_map as mapping
      on mapping.kind = 'deck-list'
      and mapping.user_id = snapshot.user_id
      and mapping.deck_id = snapshot.deck_id
      and mapping.old_id = child.value ->> 'id'
      and mapping.position = child.ordinality::integer - 1
    group by snapshot.user_id, snapshot.deck_id
  ) as rewritten
  where (deck.user_id, deck.id) = (rewritten.user_id, rewritten.deck_id)
    and exists (
      select 1
      from pg_temp.deck_aggregate_rekey_map as mapping
      where mapping.kind = 'deck-list'
        and (mapping.user_id, mapping.deck_id) = (deck.user_id, deck.id)
    );

  update public.decks as deck
  set matchups = rewritten.children
  from (
    select
      snapshot.user_id,
      snapshot.deck_id,
      jsonb_agg(
        case
          when mapping.new_id is null then child.value
          else jsonb_set(child.value, '{id}', to_jsonb(mapping.new_id), false)
        end
        order by child.ordinality
      ) as children
    from pg_temp.deck_aggregate_parent_snapshot as snapshot
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(snapshot.row_data -> 'matchups') = 'array'
          then snapshot.row_data -> 'matchups'
        else '[]'::jsonb
      end
    ) with ordinality as child(value, ordinality)
    left join pg_temp.deck_aggregate_rekey_map as mapping
      on mapping.kind = 'matchup'
      and mapping.user_id = snapshot.user_id
      and mapping.deck_id = snapshot.deck_id
      and mapping.old_id = child.value ->> 'id'
      and mapping.position = child.ordinality::integer - 1
    group by snapshot.user_id, snapshot.deck_id
  ) as rewritten
  where (deck.user_id, deck.id) = (rewritten.user_id, rewritten.deck_id)
    and exists (
      select 1
      from pg_temp.deck_aggregate_rekey_map as mapping
      where mapping.kind = 'matchup'
        and (mapping.user_id, mapping.deck_id) = (deck.user_id, deck.id)
    );

  insert into public.deck_lists (
    id,
    deck_id,
    user_id,
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
    mapping.new_id,
    mapping.deck_id,
    mapping.user_id,
    coalesce(mapping.child ->> 'name', ''),
    coalesce(mapping.child ->> 'format', ''),
    coalesce(mapping.child ->> 'date', ''),
    coalesce(mapping.child ->> 'createdBy', mapping.child ->> 'created_by', ''),
    coalesce(mapping.child ->> 'notes', ''),
    coalesce(mapping.child ->> 'rawList', mapping.child ->> 'raw_list', ''),
    coalesce(
      nullif(mapping.child -> 'parsedCards', 'null'::jsonb),
      nullif(mapping.child -> 'parsed_cards', 'null'::jsonb),
      '[]'::jsonb
    ),
    coalesce(
      nullif(mapping.child -> 'sortedCards', 'null'::jsonb),
      nullif(mapping.child -> 'sorted_cards', 'null'::jsonb),
      '[]'::jsonb
    ),
    case
      when jsonb_typeof(mapping.child -> 'sortedCardsVersion') = 'number'
        then (mapping.child ->> 'sortedCardsVersion')::integer
      when jsonb_typeof(mapping.child -> 'sorted_cards_version') = 'number'
        then (mapping.child ->> 'sorted_cards_version')::integer
      else null
    end,
    mapping.position,
    coalesce(mapping.child ->> 'createdAt', mapping.child ->> 'created_at')::timestamptz,
    coalesce(mapping.child ->> 'updatedAt', mapping.child ->> 'updated_at')::timestamptz
  from pg_temp.deck_aggregate_rekey_map as mapping
  where mapping.kind = 'deck-list';
  get diagnostics v_row_count = row_count;
  if v_row_count <> 19 then
    raise exception 'Expected 19 inserted Deck Lists, inserted %.', v_row_count;
  end if;

  insert into public.deck_matchups (
    id,
    deck_id,
    user_id,
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
    mapping.new_id,
    mapping.deck_id,
    mapping.user_id,
    coalesce(mapping.child ->> 'deckName', mapping.child ->> 'deck_name', ''),
    coalesce(
      nullif(mapping.child -> 'deckPokemon', 'null'::jsonb),
      nullif(mapping.child -> 'deck_pokemon', 'null'::jsonb),
      '[]'::jsonb
    ),
    coalesce(mapping.child ->> 'format', ''),
    case
      when coalesce(mapping.child ->> 'goPreference', mapping.child ->> 'go_preference', '')
        in ('First', 'Second')
        then coalesce(mapping.child ->> 'goPreference', mapping.child ->> 'go_preference', '')
      else ''
    end,
    coalesce(mapping.child ->> 'matchupFavor', mapping.child ->> 'matchup_favor', ''),
    coalesce(mapping.child ->> 'idealBench', mapping.child ->> 'ideal_bench', ''),
    coalesce(mapping.child ->> 'techsNeeded', mapping.child ->> 'techs_needed', ''),
    coalesce(mapping.child ->> 'matchupPlan', mapping.child ->> 'matchup_plan', ''),
    mapping.position,
    coalesce(mapping.child ->> 'createdAt', mapping.child ->> 'created_at')::timestamptz,
    coalesce(mapping.child ->> 'updatedAt', mapping.child ->> 'updated_at')::timestamptz
  from pg_temp.deck_aggregate_rekey_map as mapping
  where mapping.kind = 'matchup';
  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception 'Expected one inserted Deck Matchup, inserted %.', v_row_count;
  end if;

  update public.logs as log
  set linked_deck_list_id = mapping.new_id
  from pg_temp.deck_aggregate_rekey_map as mapping
  where mapping.kind = 'deck-list'
    and (log.user_id, log.linked_deck_id, log.linked_deck_list_id) =
      (mapping.user_id, mapping.deck_id, mapping.old_id);
  get diagnostics v_row_count = row_count;
  if v_row_count <> 31 then
    raise exception 'Expected 31 repaired Battle Log links, repaired %.', v_row_count;
  end if;

  alter table public.logs enable trigger set_logs_updated_at;
  alter table public.decks enable trigger set_decks_updated_at;

  -- The snapshots make every mutation independently checkable before this DO
  -- statement can commit. Any failure rolls back data, ledger, and trigger DDL.
  if exists (
    select 1
    from pg_temp.deck_aggregate_parent_snapshot as snapshot
    join public.decks as deck
      on (deck.user_id, deck.id) = (snapshot.user_id, snapshot.deck_id)
    where (to_jsonb(deck) - 'deck_lists' - 'matchups')
      is distinct from (snapshot.row_data - 'deck_lists' - 'matchups')
  ) then
    raise exception 'A repaired parent changed outside its aggregate child IDs.';
  end if;

  if exists (
    select 1
    from pg_temp.deck_aggregate_parent_snapshot as snapshot
    join public.decks as deck
      on (deck.user_id, deck.id) = (snapshot.user_id, snapshot.deck_id)
    cross join lateral (
      select jsonb_agg(
        case
          when mapping.new_id is null then child.value
          else jsonb_set(child.value, '{id}', to_jsonb(mapping.new_id), false)
        end
        order by child.ordinality
      ) as expected
      from jsonb_array_elements(snapshot.row_data -> 'deck_lists')
        with ordinality as child(value, ordinality)
      left join pg_temp.deck_aggregate_rekey_map as mapping
        on mapping.kind = 'deck-list'
        and mapping.user_id = snapshot.user_id
        and mapping.deck_id = snapshot.deck_id
        and mapping.old_id = child.value ->> 'id'
        and mapping.position = child.ordinality::integer - 1
    ) as list_check
    cross join lateral (
      select jsonb_agg(
        case
          when mapping.new_id is null then child.value
          else jsonb_set(child.value, '{id}', to_jsonb(mapping.new_id), false)
        end
        order by child.ordinality
      ) as expected
      from jsonb_array_elements(snapshot.row_data -> 'matchups')
        with ordinality as child(value, ordinality)
      left join pg_temp.deck_aggregate_rekey_map as mapping
        on mapping.kind = 'matchup'
        and mapping.user_id = snapshot.user_id
        and mapping.deck_id = snapshot.deck_id
        and mapping.old_id = child.value ->> 'id'
        and mapping.position = child.ordinality::integer - 1
    ) as matchup_check
    where deck.deck_lists is distinct from coalesce(list_check.expected, '[]'::jsonb)
      or deck.matchups is distinct from coalesce(matchup_check.expected, '[]'::jsonb)
  ) then
    raise exception 'A repaired aggregate differs from its ID-only expected rewrite.';
  end if;

  if exists (
    select 1
    from pg_temp.deck_aggregate_target_log_snapshot as snapshot
    join public.logs as log on log.id = snapshot.id
    join pg_temp.deck_aggregate_rekey_map as mapping
      on mapping.kind = 'deck-list'
      and (log.user_id, log.linked_deck_id, log.linked_deck_list_id) =
        (mapping.user_id, mapping.deck_id, mapping.new_id)
    where (to_jsonb(log) - 'linked_deck_list_id')
      is distinct from (snapshot.row_data - 'linked_deck_list_id')
  ) or (
    select count(*)
    from pg_temp.deck_aggregate_target_log_snapshot as snapshot
    join public.logs as log on log.id = snapshot.id
    join pg_temp.deck_aggregate_rekey_map as mapping
      on mapping.kind = 'deck-list'
      and (log.user_id, log.linked_deck_id, log.linked_deck_list_id) =
        (mapping.user_id, mapping.deck_id, mapping.new_id)
  ) <> 31 then
    raise exception 'A target Battle Log changed outside its scoped list ID.';
  end if;

  if exists (
    select 1
    from pg_temp.deck_aggregate_untouched_log_snapshot as snapshot
    join public.logs as log on log.id = snapshot.id
    where to_jsonb(log) is distinct from snapshot.row_data
  ) or (select count(*) from pg_temp.deck_aggregate_untouched_log_snapshot) <> 43 then
    raise exception 'A non-target Battle Log using a reused ID changed.';
  end if;

  if exists (
    select 1
    from pg_temp.deck_aggregate_occupied_snapshot as snapshot
    left join public.deck_lists as list
      on snapshot.kind = 'deck-list' and list.id = snapshot.id
    left join public.deck_matchups as matchup
      on snapshot.kind = 'matchup' and matchup.id = snapshot.id
    where case snapshot.kind
      when 'deck-list' then to_jsonb(list)
      else to_jsonb(matchup)
    end is distinct from snapshot.row_data
  ) then
    raise exception 'An original occupied relational row changed.';
  end if;

  if exists (
    select 1
    from pg_temp.deck_aggregate_rekey_map as mapping
    left join public.deck_lists as list
      on mapping.kind = 'deck-list'
      and (list.user_id, list.deck_id, list.id) =
        (mapping.user_id, mapping.deck_id, mapping.new_id)
    left join public.deck_matchups as matchup
      on mapping.kind = 'matchup'
      and (matchup.user_id, matchup.deck_id, matchup.id) =
        (mapping.user_id, mapping.deck_id, mapping.new_id)
    where (mapping.kind = 'deck-list' and list.id is null)
      or (mapping.kind = 'matchup' and matchup.id is null)
  ) then
    raise exception 'A re-keyed relational child is missing from its owner and parent.';
  end if;

  if exists (
    select 1
    from pg_temp.deck_aggregate_rekey_map as mapping
    join public.deck_lists as list
      on mapping.kind = 'deck-list'
      and (list.user_id, list.deck_id, list.id) =
        (mapping.user_id, mapping.deck_id, mapping.new_id)
    where list.name is distinct from coalesce(mapping.child ->> 'name', '')
      or list.format is distinct from coalesce(mapping.child ->> 'format', '')
      or list.date is distinct from coalesce(mapping.child ->> 'date', '')
      or list.created_by is distinct from coalesce(
        mapping.child ->> 'createdBy',
        mapping.child ->> 'created_by',
        ''
      )
      or list.notes is distinct from coalesce(mapping.child ->> 'notes', '')
      or list.raw_list is distinct from coalesce(
        mapping.child ->> 'rawList',
        mapping.child ->> 'raw_list',
        ''
      )
      or list.parsed_cards is distinct from coalesce(
        nullif(mapping.child -> 'parsedCards', 'null'::jsonb),
        nullif(mapping.child -> 'parsed_cards', 'null'::jsonb),
        '[]'::jsonb
      )
      or list.sorted_cards is distinct from coalesce(
        nullif(mapping.child -> 'sortedCards', 'null'::jsonb),
        nullif(mapping.child -> 'sorted_cards', 'null'::jsonb),
        '[]'::jsonb
      )
      or list.sorted_cards_version is distinct from case
        when jsonb_typeof(mapping.child -> 'sortedCardsVersion') = 'number'
          then (mapping.child ->> 'sortedCardsVersion')::integer
        when jsonb_typeof(mapping.child -> 'sorted_cards_version') = 'number'
          then (mapping.child ->> 'sorted_cards_version')::integer
        else null
      end
      or list.position is distinct from mapping.position
      or list.created_at is distinct from coalesce(
        mapping.child ->> 'createdAt',
        mapping.child ->> 'created_at'
      )::timestamptz
      or list.updated_at is distinct from coalesce(
        mapping.child ->> 'updatedAt',
        mapping.child ->> 'updated_at'
      )::timestamptz
  ) then
    raise exception 'A re-keyed Deck List differs from its preserved JSON source.';
  end if;

  if exists (
    select 1
    from pg_temp.deck_aggregate_rekey_map as mapping
    join public.deck_matchups as matchup
      on mapping.kind = 'matchup'
      and (matchup.user_id, matchup.deck_id, matchup.id) =
        (mapping.user_id, mapping.deck_id, mapping.new_id)
    where matchup.deck_name is distinct from coalesce(
        mapping.child ->> 'deckName',
        mapping.child ->> 'deck_name',
        ''
      )
      or matchup.deck_pokemon is distinct from coalesce(
        nullif(mapping.child -> 'deckPokemon', 'null'::jsonb),
        nullif(mapping.child -> 'deck_pokemon', 'null'::jsonb),
        '[]'::jsonb
      )
      or matchup.format is distinct from coalesce(mapping.child ->> 'format', '')
      or matchup.go_preference is distinct from case
        when coalesce(
          mapping.child ->> 'goPreference',
          mapping.child ->> 'go_preference',
          ''
        ) in ('First', 'Second')
          then coalesce(
            mapping.child ->> 'goPreference',
            mapping.child ->> 'go_preference',
            ''
          )
        else ''
      end
      or matchup.matchup_favor is distinct from coalesce(
        mapping.child ->> 'matchupFavor',
        mapping.child ->> 'matchup_favor',
        ''
      )
      or matchup.ideal_bench is distinct from coalesce(
        mapping.child ->> 'idealBench',
        mapping.child ->> 'ideal_bench',
        ''
      )
      or matchup.techs_needed is distinct from coalesce(
        mapping.child ->> 'techsNeeded',
        mapping.child ->> 'techs_needed',
        ''
      )
      or matchup.matchup_plan is distinct from coalesce(
        mapping.child ->> 'matchupPlan',
        mapping.child ->> 'matchup_plan',
        ''
      )
      or matchup.position is distinct from mapping.position
      or matchup.created_at is distinct from coalesce(
        mapping.child ->> 'createdAt',
        mapping.child ->> 'created_at'
      )::timestamptz
      or matchup.updated_at is distinct from coalesce(
        mapping.child ->> 'updatedAt',
        mapping.child ->> 'updated_at'
      )::timestamptz
  ) then
    raise exception 'A re-keyed Deck Matchup differs from its preserved JSON source.';
  end if;

  if (
    select count(*)
    from public.deck_lists
  ) <> 49 or (
    select count(*)
    from public.deck_matchups
  ) <> 2 then
    raise exception 'Post-repair relational totals are not 49 Deck Lists and two Matchups.';
  end if;

  if exists (
    select 1
    from public.decks as deck
    cross join lateral jsonb_array_elements(deck.deck_lists) as child(value)
    left join public.deck_lists as list
      on (list.user_id, list.deck_id, list.id) =
        (deck.user_id, deck.id, child.value ->> 'id')
    where list.id is null
  ) or exists (
    select 1
    from public.deck_lists as list
    left join public.decks as deck
      on (deck.user_id, deck.id) = (list.user_id, list.deck_id)
    where deck.id is null
      or not exists (
        select 1
        from jsonb_array_elements(deck.deck_lists) as child(value)
        where child.value ->> 'id' = list.id
      )
  ) or exists (
    select 1
    from public.decks as deck
    cross join lateral jsonb_array_elements(deck.matchups) as child(value)
    left join public.deck_matchups as matchup
      on (matchup.user_id, matchup.deck_id, matchup.id) =
        (deck.user_id, deck.id, child.value ->> 'id')
    where matchup.id is null
  ) or exists (
    select 1
    from public.deck_matchups as matchup
    left join public.decks as deck
      on (deck.user_id, deck.id) = (matchup.user_id, matchup.deck_id)
    where deck.id is null
      or not exists (
        select 1
        from jsonb_array_elements(deck.matchups) as child(value)
        where child.value ->> 'id' = matchup.id
      )
  ) then
    raise exception 'Deck Aggregate scoped-key parity is not complete after repair.';
  end if;

  if exists (
    select child.value ->> 'id'
    from public.decks as deck
    cross join lateral jsonb_array_elements(deck.deck_lists) as child(value)
    group by child.value ->> 'id'
    having count(*) > 1
  ) or exists (
    select child.value ->> 'id'
    from public.decks as deck
    cross join lateral jsonb_array_elements(deck.matchups) as child(value)
    group by child.value ->> 'id'
    having count(*) > 1
  ) then
    raise exception 'A cross-parent Deck Aggregate child ID collision remains.';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_trigger as trigger
    join pg_catalog.pg_class as relation on relation.oid = trigger.tgrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and (relation.relname, trigger.tgname) in (
        ('decks', 'set_decks_updated_at'),
        ('logs', 'set_logs_updated_at')
      )
      and trigger.tgenabled = 'O'
  ) <> 2 then
    raise exception 'Timestamp-preservation triggers were not restored.';
  end if;

  raise notice
    'Re-keyed % Deck Lists, % Matchup, and % scoped Battle Log links; % reused-ID links remained untouched.',
    v_list_count,
    v_matchup_count,
    v_target_log_count,
    v_untouched_log_count;
end;
$repair$;

comment on table private.deck_aggregate_rekey_ledger is
  'Private old-to-new Deck Aggregate ID evidence retained through the 30-day compatibility period; contains identifiers only, never user content.';

-- Rollback guidance: application rollback does not require reversing this
-- repair. The old application accepts the new collision-free IDs. If a narrow
-- operational reversal is ever explicitly approved, use the private ledger in
-- one locked transaction to restore scoped links/JSON IDs, delete only the new
-- relational rows, and re-run every assertion above. Never reverse by ID alone.
