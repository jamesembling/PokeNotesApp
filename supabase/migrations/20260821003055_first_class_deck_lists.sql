-- First-class Deck Lists are account-owned records. The optional Deck Strategy
-- association is kept in the same row so attaching, detaching, and strategy
-- deletion never delete the list itself.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.deck_lists
  add column if not exists creation_key text;

alter table public.deck_lists
  alter column deck_id drop not null;

-- ADR 0001 permits the same legacy child id in two different accounts. The
-- relational identity therefore follows the account, while every application
-- reference remains (user_id, id) scoped.
alter table public.deck_lists
  drop constraint if exists deck_lists_pkey;

alter table public.deck_lists
  add constraint deck_lists_pkey primary key (user_id, id);

alter table public.deck_lists
  drop constraint if exists deck_lists_owner_deck_fkey;

alter table public.deck_lists
  add constraint deck_lists_owner_deck_fkey
  foreign key (user_id, deck_id)
  references public.decks (user_id, id)
  on delete set null (deck_id)
  not valid;

alter table public.deck_lists
  validate constraint deck_lists_owner_deck_fkey;

create unique index if not exists deck_lists_user_creation_key_unique
  on public.deck_lists (user_id, creation_key)
  where creation_key is not null;

create index if not exists deck_lists_user_updated
  on public.deck_lists (user_id, updated_at desc, id);

comment on table public.deck_lists is
  'First-class account-owned Deck Lists. deck_id is an optional Deck Strategy association; the JSON copy remains active for ADR 0001 compatibility.';
comment on column public.deck_lists.deck_id is
  'Optional account-owned Deck Strategy association. Deleting the strategy clears this column without deleting the Deck List.';
comment on column public.deck_lists.creation_key is
  'Per-account idempotency identity for a deliberate Deck List creation. Legacy rows may remain null.';

-- Existing logs and tournaments may still reference legacy JSON-only lists.
-- Deliberately do not add list foreign keys during the ADR 0001 compatibility
-- window: a legacy reference has no relational row to satisfy such a key.
alter table public.logs
  drop constraint if exists logs_linked_deck_list_requires_deck;
alter table public.tournaments
  drop constraint if exists tournaments_linked_deck_list_requires_deck;

-- The old trigger cleared a list reference whenever the strategy reference was
-- null. That is correct only for the pre-ADR-0002 model, so it must become a
-- no-op while keeping the function name available to older schema tooling.
create or replace function public.clear_orphaned_deck_list_link()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
  return new;
end;
$function$;

-- Direct list deletion is deliberate, but it must preserve a same-account
-- legacy copy that belongs to another Deck Strategy with the same child id.
create or replace function public.remove_deleted_deck_list_legacy_copy()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
begin
  -- Lock order: Deck List then strategy. A direct delete already owns the
  -- list row before this trigger runs, so it follows the same order.
  update public.logs as log
  set linked_deck_list_id = null
  where log.user_id = old.user_id
    and log.linked_deck_list_id = old.id
    and (
      log.linked_deck_id is null
      or log.linked_deck_id = old.deck_id
      or not exists (
        select 1
        from public.decks as legacy_deck
        cross join lateral jsonb_array_elements(
          case
            when jsonb_typeof(legacy_deck.deck_lists) = 'array' then legacy_deck.deck_lists
            else '[]'::jsonb
          end
        ) as item(value)
        where legacy_deck.user_id = old.user_id
          and legacy_deck.id = log.linked_deck_id
          and item.value ->> 'id' = old.id
      )
    );

  update public.tournaments as tournament
  set linked_deck_list_id = null
  where tournament.user_id = old.user_id
    and tournament.linked_deck_list_id = old.id
    and (
      tournament.linked_deck_id is null
      or tournament.linked_deck_id = old.deck_id
      or not exists (
        select 1
        from public.decks as legacy_deck
        cross join lateral jsonb_array_elements(
          case
            when jsonb_typeof(legacy_deck.deck_lists) = 'array' then legacy_deck.deck_lists
            else '[]'::jsonb
          end
        ) as item(value)
        where legacy_deck.user_id = old.user_id
          and legacy_deck.id = tournament.linked_deck_id
          and item.value ->> 'id' = old.id
      )
    );

  if old.deck_id is not null then
    update public.decks as deck
    set deck_lists = coalesce(
      (
        select jsonb_agg(item.value order by item.ordinal)
        from jsonb_array_elements(
          case
            when jsonb_typeof(deck.deck_lists) = 'array' then deck.deck_lists
            else '[]'::jsonb
          end
        ) with ordinality as item(value, ordinal)
        where item.value ->> 'id' <> old.id
      ),
      '[]'::jsonb
    ),
    updated_at = now()
    where deck.user_id = old.user_id
      and deck.id = old.deck_id;
  end if;

  return old;
end;
$function$;

revoke all on function public.remove_deleted_deck_list_legacy_copy() from public, anon, authenticated;
drop trigger if exists remove_deleted_deck_list_legacy_copy on public.deck_lists;
create trigger remove_deleted_deck_list_legacy_copy
  before delete on public.deck_lists
  for each row execute function public.remove_deleted_deck_list_legacy_copy();

-- This helper is used by logs and tournaments as a database-level reference
-- boundary. First-class rows are account-owned and strategy-independent;
-- legacy JSON remains an exact strategy-scoped fallback.
create or replace function public.can_use_deck_list_reference(
  p_user_id uuid,
  p_deck_id text,
  p_deck_list_id text
)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select case
    when p_deck_id is null and p_deck_list_id is null then true
    when p_deck_id is not null and not exists (
      select 1
      from public.decks as deck
      where deck.user_id = p_user_id
        and deck.id = p_deck_id
    ) then false
    when p_deck_list_id is null then true
    when p_deck_id is null and exists (
      select 1
      from public.deck_lists as deck_list
      where deck_list.user_id = p_user_id
        and deck_list.id = p_deck_list_id
    ) then true
    when p_deck_id is not null and exists (
      select 1
      from public.deck_lists as deck_list
      where deck_list.user_id = p_user_id
        and deck_list.id = p_deck_list_id
    ) then true
    when p_deck_id is not null and exists (
      select 1
      from public.decks as deck
      where deck.user_id = p_user_id
        and deck.id = p_deck_id
        and jsonb_typeof(deck.deck_lists) = 'array'
        and exists (
          select 1
          from jsonb_array_elements(deck.deck_lists) as item(value)
          where item.value ->> 'id' = p_deck_list_id
        )
    ) then true
    else false
  end;
$function$;

revoke all on function public.can_use_deck_list_reference(uuid, text, text) from public, anon;
grant execute on function public.can_use_deck_list_reference(uuid, text, text) to authenticated;

alter policy "Users can insert own logs"
  on public.logs
  with check (
    (select auth.uid()) = user_id
    and (select public.can_use_deck_list_reference(user_id, linked_deck_id, linked_deck_list_id))
  );

alter policy "Users can update own logs"
  on public.logs
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (select public.can_use_deck_list_reference(user_id, linked_deck_id, linked_deck_list_id))
  );

alter policy "Users can insert own tournaments"
  on public.tournaments
  with check (
    (select auth.uid()) = user_id
    and (select public.can_use_deck_list_reference(user_id, linked_deck_id, linked_deck_list_id))
  );

alter policy "Users can update own tournaments"
  on public.tournaments
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (select public.can_use_deck_list_reference(user_id, linked_deck_id, linked_deck_list_id))
  );

-- The pre-existing compatibility RPC takes a strategy row before its
-- relational child. Wrap it with the first-class list lock so legacy fallback
-- writes use the same Deck List -> Strategy order as the new paths.
alter function public.commit_deck_aggregate_child(
  text, text, text, jsonb, text, timestamptz
) rename to commit_deck_aggregate_child_legacy_parent_first;

-- The renamed implementation takes the opposite lock order and is callable
-- only by the reviewed wrapper below. PUBLIC includes anon/authenticated via
-- role inheritance, so revoke every direct execution path explicitly.
alter function public.commit_deck_aggregate_child_legacy_parent_first(
  text, text, text, jsonb, text, timestamptz
) security definer;
alter function public.commit_deck_aggregate_child_legacy_parent_first(
  text, text, text, jsonb, text, timestamptz
) set search_path = pg_catalog, public;
revoke all on function public.commit_deck_aggregate_child_legacy_parent_first(
  text, text, text, jsonb, text, timestamptz
) from public, anon, authenticated;

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
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_child_id text := nullif(btrim(p_child ->> 'id'), '');
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if p_kind = 'deck-list' and v_child_id is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(v_user_id::text || ':deck-list-mutations', 0)
    );
    perform pg_advisory_xact_lock(
      hashtextextended(v_user_id::text || ':deck-list:' || p_operation || ':' || v_child_id, 0)
    );
    perform 1
    from public.deck_lists
    where user_id = v_user_id
      and id = v_child_id
    for update;
  end if;

  return public.commit_deck_aggregate_child_legacy_parent_first(
    p_deck_id,
    p_kind,
    p_operation,
    p_child,
    p_expected_child_updated_at,
    p_updated_at
  );
end;
$function$;

revoke all on function public.commit_deck_aggregate_child(
  text, text, text, jsonb, text, timestamptz
) from public, anon;
grant execute on function public.commit_deck_aggregate_child(
  text, text, text, jsonb, text, timestamptz
) to authenticated;

-- Atomic first-class create/update. The caller supplies a stable creation_key
-- and list id. Identical retries return the original row; a reused key with a
-- different payload fails closed. Updates use updated_at as the optimistic
-- concurrency version and return refresh-and-retry guidance on stale writes.
create or replace function public.commit_first_class_deck_list(
  p_deck_id text,
  p_operation text,
  p_payload jsonb,
  p_creation_key text,
  p_expected_updated_at timestamptz,
  p_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_deck_id text := nullif(btrim(p_deck_id), '');
  v_creation_key text := nullif(btrim(p_creation_key), '');
  v_list_id text;
  v_position integer;
  v_existing public.deck_lists%rowtype;
  v_inserted public.deck_lists%rowtype;
  v_current public.deck_lists%rowtype;
  v_legacy_children jsonb;
  v_next_children jsonb;
  v_requested_fingerprint jsonb;
  v_existing_fingerprint jsonb;
  v_legacy_match_count integer := 0;
  v_migrated_legacy boolean := false;
  v_target_id text;
  v_legacy_item jsonb;
  v_legacy_updated_at timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  -- Every Deck List and Deck Strategy mutation shares this transaction-level
  -- serialization boundary before taking any row lock. This prevents a
  -- strategy delete's parent->child FK locks from crossing list-first paths.
  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':deck-list-mutations', 0)
  );

  if p_operation not in ('create', 'update') then
    raise exception using errcode = '22023', message = 'Unsupported Deck List operation.';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Deck List payload must be an object.';
  end if;

  v_list_id := nullif(btrim(p_payload ->> 'id'), '');
  if v_list_id is null then
    raise exception using errcode = '22023', message = 'Deck List id is required.';
  end if;

  if nullif(btrim(coalesce(p_payload ->> 'name', '')), '') is null then
    raise exception using errcode = '22023', message = 'Deck List name is required.';
  end if;

  if nullif(btrim(coalesce(p_payload ->> 'rawList', p_payload ->> 'raw_list', '')), '') is null then
    raise exception using errcode = '22023', message = 'Deck List text is required.';
  end if;

  if jsonb_typeof(coalesce(p_payload -> 'parsedCards', p_payload -> 'parsed_cards')) is distinct from 'array'
    or jsonb_typeof(coalesce(p_payload -> 'sortedCards', p_payload -> 'sorted_cards')) is distinct from 'array'
    or jsonb_typeof(coalesce(p_payload -> 'sortedCardsVersion', p_payload -> 'sorted_cards_version')) is distinct from 'number'
  then
    raise exception using errcode = '22023', message = 'Deck List card data is invalid.';
  end if;

  if p_updated_at is null then
    raise exception using errcode = '22023', message = 'An update timestamp is required.';
  end if;

  if p_operation = 'create' then
    if v_creation_key is null then
      raise exception using errcode = '22023', message = 'A Deck List creation key is required.';
    end if;

    if v_list_id is distinct from v_creation_key then
      raise exception using errcode = '22023', message = 'Deck List id must equal its creation key.';
    end if;

    -- An absent SELECT FOR UPDATE cannot serialize the first writer. The
    -- account/key advisory lock makes the unique creation identity a real
    -- concurrency boundary before the row exists.
    perform pg_advisory_xact_lock(
      hashtextextended(v_user_id::text || ':deck-list:create:' || v_creation_key, 0)
    );

    if v_deck_id is not null then
      perform 1
      from public.decks
      where user_id = v_user_id
        and id = v_deck_id
      for update;

      if not found then
        raise exception using errcode = '42501', message = 'Deck Strategy could not be found.';
      end if;
    end if;

    select *
    into v_existing
    from public.deck_lists
    where user_id = v_user_id
      and creation_key = v_creation_key
    for update;

    v_requested_fingerprint := jsonb_build_object(
      'deck_id', v_deck_id,
      'name', btrim(p_payload ->> 'name'),
      'format', coalesce(p_payload ->> 'format', ''),
      'date', coalesce(p_payload ->> 'date', ''),
      'created_by', coalesce(p_payload ->> 'createdBy', p_payload ->> 'created_by', ''),
      'notes', coalesce(p_payload ->> 'notes', ''),
      'raw_list', coalesce(p_payload ->> 'rawList', p_payload ->> 'raw_list', ''),
      'parsed_cards', coalesce(p_payload -> 'parsedCards', p_payload -> 'parsed_cards'),
      'sorted_cards', coalesce(p_payload -> 'sortedCards', p_payload -> 'sorted_cards'),
      'sorted_cards_version', coalesce(p_payload -> 'sortedCardsVersion', p_payload -> 'sorted_cards_version')
    );

    if found then
      v_existing_fingerprint := jsonb_build_object(
        'deck_id', v_existing.deck_id,
        'name', v_existing.name,
        'format', v_existing.format,
        'date', v_existing.date,
        'created_by', v_existing.created_by,
        'notes', v_existing.notes,
        'raw_list', v_existing.raw_list,
        'parsed_cards', v_existing.parsed_cards,
        'sorted_cards', v_existing.sorted_cards,
        'sorted_cards_version', v_existing.sorted_cards_version
      );

      if v_existing_fingerprint = v_requested_fingerprint then
        return jsonb_build_object('status', 'idempotent', 'deckList', to_jsonb(v_existing));
      end if;

      raise exception using
        errcode = '23505',
        message = 'Conflicting idempotency key for Deck List creation.';
    end if;

    -- A new first-class identity may not shadow any same-account legacy copy.
    -- Cross-account copies are intentionally allowed because this scan is
    -- explicitly tenant-scoped.
    select count(*)
    into v_legacy_match_count
    from public.decks as deck
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(deck.deck_lists) = 'array' then deck.deck_lists else '[]'::jsonb end
    ) as item(value)
    where deck.user_id = v_user_id
      and item.value ->> 'id' = v_list_id;

    if v_legacy_match_count > 0 then
      raise exception using
        errcode = '23505',
        message = 'Deck List id is already represented by a legacy Deck List.';
    end if;

    if exists (
      select 1
      from public.deck_lists
      where user_id = v_user_id
        and id = v_list_id
    ) then
      raise exception using
        errcode = '23505',
        message = 'Deck List id is already in use.';
    end if;

    select coalesce(min(position) - 1, 0)
    into v_position
    from public.deck_lists
    where user_id = v_user_id
      and deck_id is not distinct from v_deck_id;

    insert into public.deck_lists (
      id, deck_id, user_id, creation_key, name, format, date, created_by,
      notes, raw_list, parsed_cards, sorted_cards, sorted_cards_version,
      position, created_at, updated_at
    )
    values (
      v_list_id,
      v_deck_id,
      v_user_id,
      v_creation_key,
      btrim(p_payload ->> 'name'),
      coalesce(p_payload ->> 'format', ''),
      coalesce(p_payload ->> 'date', ''),
      coalesce(p_payload ->> 'createdBy', p_payload ->> 'created_by', ''),
      coalesce(p_payload ->> 'notes', ''),
      coalesce(p_payload ->> 'rawList', p_payload ->> 'raw_list', ''),
      coalesce(p_payload -> 'parsedCards', p_payload -> 'parsed_cards'),
      coalesce(p_payload -> 'sortedCards', p_payload -> 'sorted_cards'),
      coalesce((p_payload ->> 'sortedCardsVersion')::integer, (p_payload ->> 'sorted_cards_version')::integer),
      v_position,
      coalesce(nullif(p_payload ->> 'createdAt', '')::timestamptz, p_updated_at),
      p_updated_at
    )
    returning * into v_inserted;

    v_current := v_inserted;
  else
    -- Updates lock the list identity before the optional strategy row. This
    -- also serializes a legacy JSON-only migration-on-write with association
    -- changes for the same list.
    perform pg_advisory_xact_lock(
      hashtextextended(v_user_id::text || ':deck-list:update:' || v_list_id, 0)
    );

    select *
    into v_current
    from public.deck_lists
    where user_id = v_user_id
      and id = v_list_id
    for update;

    if not found and v_deck_id is not null then
      declare
        v_legacy_item jsonb;
        v_legacy_updated_at timestamptz;
        v_legacy_source_deck_id text;
      begin
        -- Adoption is valid only for one exact owned legacy source. A
        -- same-account duplicate is intentionally ambiguous even when the
        -- caller supplies one candidate strategy id.
        select count(*)
        into v_legacy_match_count
        from public.decks as deck
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(deck.deck_lists) = 'array' then deck.deck_lists else '[]'::jsonb end
        ) as item(value)
        where deck.user_id = v_user_id
          and item.value ->> 'id' = v_list_id;

        if v_legacy_match_count = 0 then
          raise exception using errcode = 'P0002', message = 'Deck List could not be found.';
        elsif v_legacy_match_count > 1 then
          raise exception using
            errcode = 'P0002',
            message = 'Deck List identity is ambiguous across this account; choose one legacy source.';
        end if;

        v_legacy_source_deck_id := nullif(btrim(p_payload ->> '_legacySourceDeckId'), '');
        if v_legacy_source_deck_id is distinct from v_deck_id then
          raise exception using
            errcode = 'P0002',
            message = 'Legacy Deck List adoption requires its exact owned source.';
        end if;

        select deck_lists
        into v_legacy_children
        from public.decks
        where user_id = v_user_id
          and id = v_deck_id
        for update;

        if not found then
          raise exception using errcode = '42501', message = 'Deck Strategy could not be found.';
        end if;

        select item.value
        into v_legacy_item
        from jsonb_array_elements(
          case when jsonb_typeof(v_legacy_children) = 'array' then v_legacy_children else '[]'::jsonb end
        ) as item(value)
        where item.value ->> 'id' = v_list_id;

        if not found then
          raise exception using errcode = 'P0002', message = 'Deck List could not be found.';
        end if;

        v_legacy_updated_at := nullif(
          coalesce(v_legacy_item ->> 'updatedAt', v_legacy_item ->> 'updated_at'),
          ''
        )::timestamptz;
        if p_expected_updated_at is null
          or (v_legacy_updated_at is not null and v_legacy_updated_at is distinct from p_expected_updated_at)
          or (v_legacy_updated_at is not null and p_updated_at <= v_legacy_updated_at)
        then
          raise exception using errcode = 'P0001', message = 'Deck List changed; refresh-and-retry before saving.';
        end if;

        select coalesce(min(position) - 1, 0)
        into v_position
        from public.deck_lists
        where user_id = v_user_id
          and deck_id is not distinct from v_deck_id;

        insert into public.deck_lists (
          id, deck_id, user_id, creation_key, name, format, date, created_by,
          notes, raw_list, parsed_cards, sorted_cards, sorted_cards_version,
          position, created_at, updated_at
        ) values (
          v_list_id,
          v_deck_id,
          v_user_id,
          null,
          btrim(p_payload ->> 'name'),
          coalesce(p_payload ->> 'format', ''),
          coalesce(p_payload ->> 'date', ''),
          coalesce(p_payload ->> 'createdBy', p_payload ->> 'created_by', ''),
          coalesce(p_payload ->> 'notes', ''),
          coalesce(p_payload ->> 'rawList', p_payload ->> 'raw_list', ''),
          coalesce(p_payload -> 'parsedCards', p_payload -> 'parsed_cards'),
          coalesce(p_payload -> 'sortedCards', p_payload -> 'sorted_cards'),
          coalesce((p_payload ->> 'sortedCardsVersion')::integer, (p_payload ->> 'sorted_cards_version')::integer),
          v_position,
          coalesce(nullif(coalesce(p_payload ->> 'createdAt', p_payload ->> 'created_at'), '')::timestamptz, p_updated_at),
          p_updated_at
        ) returning * into v_current;
        v_migrated_legacy := true;
      end;
    elsif not found then
      raise exception using errcode = 'P0002', message = 'Deck List could not be found.';
    end if;

    if v_current.id is not null and v_current.deck_id is distinct from v_deck_id then
      if v_deck_id is null
        or nullif(btrim(p_payload ->> '_legacySourceDeckId'), '') is distinct from v_deck_id
      then
        raise exception using
          errcode = 'P0001',
          message = 'Deck List association changed; refresh-and-retry before saving.';
      end if;

      -- A strategy-scoped legacy list can be adopted even when another
      -- strategy already owns the same legacy ID. Never update that other
      -- relational row: re-key the exact legacy source and move its links.
      select count(*)
      into v_legacy_match_count
      from public.decks as deck
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(deck.deck_lists) = 'array' then deck.deck_lists else '[]'::jsonb end
      ) as item(value)
      where deck.user_id = v_user_id
        and item.value ->> 'id' = v_list_id
        and not (
          v_current.deck_id is not null
          and deck.id = v_current.deck_id
          and item.value ->> 'id' = v_current.id
        );

      if v_legacy_match_count <> 1 then
        raise exception using
          errcode = 'P0002',
          message = 'Deck List identity is ambiguous across this account; choose one legacy source.';
      end if;

      select deck_lists
      into v_legacy_children
      from public.decks
      where user_id = v_user_id
        and id = v_deck_id
      for update;
      if not found then
        raise exception using errcode = '42501', message = 'Deck Strategy could not be found.';
      end if;

      select item.value
      into v_legacy_item
      from jsonb_array_elements(
        case when jsonb_typeof(v_legacy_children) = 'array' then v_legacy_children else '[]'::jsonb end
      ) as item(value)
      where item.value ->> 'id' = v_list_id;
      if not found then
        raise exception using errcode = 'P0002', message = 'Deck List could not be found.';
      end if;

      v_legacy_updated_at := nullif(
        coalesce(v_legacy_item ->> 'updatedAt', v_legacy_item ->> 'updated_at'),
        ''
      )::timestamptz;
      if p_expected_updated_at is null
        or (v_legacy_updated_at is not null and v_legacy_updated_at is distinct from p_expected_updated_at)
        or (v_legacy_updated_at is not null and p_updated_at <= v_legacy_updated_at)
      then
        raise exception using errcode = 'P0001', message = 'Deck List changed; refresh-and-retry before saving.';
      end if;

      v_target_id := gen_random_uuid()::text;
      select coalesce(min(position) - 1, 0)
      into v_position
      from public.deck_lists
      where user_id = v_user_id
        and deck_id is not distinct from v_deck_id;

      insert into public.deck_lists (
        id, deck_id, user_id, creation_key, name, format, date, created_by,
        notes, raw_list, parsed_cards, sorted_cards, sorted_cards_version,
        position, created_at, updated_at
      ) values (
        v_target_id,
        v_deck_id,
        v_user_id,
        null,
        btrim(p_payload ->> 'name'),
        coalesce(p_payload ->> 'format', ''),
        coalesce(p_payload ->> 'date', ''),
        coalesce(p_payload ->> 'createdBy', p_payload ->> 'created_by', ''),
        coalesce(p_payload ->> 'notes', ''),
        coalesce(p_payload ->> 'rawList', p_payload ->> 'raw_list', ''),
        coalesce(p_payload -> 'parsedCards', p_payload -> 'parsed_cards'),
        coalesce(p_payload -> 'sortedCards', p_payload -> 'sorted_cards'),
        coalesce((p_payload ->> 'sortedCardsVersion')::integer, (p_payload ->> 'sorted_cards_version')::integer),
        v_position,
        coalesce(
          nullif(coalesce(p_payload ->> 'createdAt', p_payload ->> 'created_at'), '')::timestamptz,
          v_legacy_updated_at,
          p_updated_at
        ),
        p_updated_at
      ) returning * into v_current;

      update public.logs
      set linked_deck_list_id = v_target_id
      where user_id = v_user_id
        and linked_deck_id = v_deck_id
        and linked_deck_list_id = v_list_id;
      update public.tournaments
      set linked_deck_list_id = v_target_id
      where user_id = v_user_id
        and linked_deck_id = v_deck_id
        and linked_deck_list_id = v_list_id;

      select coalesce(
        jsonb_agg(
          case when item.value ->> 'id' = v_list_id then jsonb_build_object(
            'id', v_current.id,
            'name', v_current.name,
            'format', v_current.format,
            'date', v_current.date,
            'createdBy', v_current.created_by,
            'notes', v_current.notes,
            'rawList', v_current.raw_list,
            'parsedCards', v_current.parsed_cards,
            'sortedCards', v_current.sorted_cards,
            'sortedCardsVersion', v_current.sorted_cards_version,
            'createdAt', v_current.created_at,
            'updatedAt', v_current.updated_at
          ) else item.value end
          order by item.ordinal
        ),
        '[]'::jsonb
      )
      into v_next_children
      from jsonb_array_elements(v_legacy_children) with ordinality as item(value, ordinal);
      update public.decks
      set deck_lists = v_next_children,
          updated_at = p_updated_at
      where user_id = v_user_id
        and id = v_deck_id;
      v_migrated_legacy := true;
    end if;

    if not v_migrated_legacy then
      -- A relational row may coexist with one deliberate compatibility copy,
      -- but duplicate same-account legacy identities are never safe to replace.
      select count(*)
      into v_legacy_match_count
      from public.decks as deck
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(deck.deck_lists) = 'array' then deck.deck_lists else '[]'::jsonb end
      ) as item(value)
      where deck.user_id = v_user_id
        and item.value ->> 'id' = v_current.id
        and not (
          v_current.deck_id is not null
          and deck.id = v_current.deck_id
          and item.value ->> 'id' = v_current.id
        );

      if v_legacy_match_count > 1 then
        raise exception using
          errcode = 'P0002',
          message = 'Deck List identity is ambiguous across this account; no compatibility copy was changed.';
      end if;
      if v_legacy_match_count = 1 and (
        v_current.deck_id is null
        or not exists (
          select 1
          from public.decks as deck
          cross join lateral jsonb_array_elements(
            case when jsonb_typeof(deck.deck_lists) = 'array' then deck.deck_lists else '[]'::jsonb end
          ) as item(value)
          where deck.user_id = v_user_id
            and deck.id = v_current.deck_id
            and item.value ->> 'id' = v_current.id
        )
      ) then
        raise exception using
          errcode = 'P0002',
          message = 'Deck List compatibility copy does not match its owned strategy.';
      end if;

      if p_expected_updated_at is null
        or v_current.updated_at is distinct from p_expected_updated_at
        or p_updated_at <= v_current.updated_at
      then
        raise exception using
          errcode = 'P0001',
          message = 'Deck List changed; refresh-and-retry before saving.';
      end if;

      update public.deck_lists
      set name = btrim(p_payload ->> 'name'),
        format = coalesce(p_payload ->> 'format', ''),
        date = coalesce(p_payload ->> 'date', ''),
        created_by = coalesce(p_payload ->> 'createdBy', p_payload ->> 'created_by', ''),
        notes = coalesce(p_payload ->> 'notes', ''),
        raw_list = coalesce(p_payload ->> 'rawList', p_payload ->> 'raw_list', ''),
        parsed_cards = coalesce(p_payload -> 'parsedCards', p_payload -> 'parsed_cards'),
        sorted_cards = coalesce(p_payload -> 'sortedCards', p_payload -> 'sorted_cards'),
        sorted_cards_version = coalesce((p_payload ->> 'sortedCardsVersion')::integer, (p_payload ->> 'sorted_cards_version')::integer),
        updated_at = p_updated_at
      where user_id = v_user_id
        and id = v_list_id
        returning * into v_current;
    end if;

    if v_deck_id is not null then
      perform 1
      from public.decks
      where user_id = v_user_id
        and id = v_deck_id
      for update;

      if not found then
        raise exception using errcode = '42501', message = 'Deck Strategy could not be found.';
      end if;
    end if;
  end if;

  -- Keep the associated legacy copy synchronized until ADR 0001's reviewed
  -- exit checks retire dual persistence. Standalone lists have no JSON parent.
  if v_current.deck_id is not null then
    select deck_lists
    into v_legacy_children
    from public.decks
    where user_id = v_user_id
      and id = v_current.deck_id
    for update;

    if jsonb_typeof(v_legacy_children) is distinct from 'array' then
      v_legacy_children := '[]'::jsonb;
    end if;

    select coalesce(
      jsonb_agg(
        case when item.value ->> 'id' = v_current.id then jsonb_build_object(
          'id', v_current.id,
          'name', v_current.name,
          'format', v_current.format,
          'date', v_current.date,
          'createdBy', v_current.created_by,
          'notes', v_current.notes,
          'rawList', v_current.raw_list,
          'parsedCards', v_current.parsed_cards,
          'sortedCards', v_current.sorted_cards,
          'sortedCardsVersion', v_current.sorted_cards_version,
          'createdAt', v_current.created_at,
          'updatedAt', v_current.updated_at
        ) else item.value end
        order by item.ordinal
      ),
      '[]'::jsonb
    )
    into v_next_children
    from jsonb_array_elements(v_legacy_children) with ordinality as item(value, ordinal);

    if not exists (
      select 1
      from jsonb_array_elements(v_legacy_children) as item(value)
      where item.value ->> 'id' = v_current.id
    ) then
      v_next_children := jsonb_build_array(jsonb_build_object(
        'id', v_current.id,
        'name', v_current.name,
        'format', v_current.format,
        'date', v_current.date,
        'createdBy', v_current.created_by,
        'notes', v_current.notes,
        'rawList', v_current.raw_list,
        'parsedCards', v_current.parsed_cards,
        'sortedCards', v_current.sorted_cards,
        'sortedCardsVersion', v_current.sorted_cards_version,
        'createdAt', v_current.created_at,
        'updatedAt', v_current.updated_at
      )) || v_next_children;
    end if;

    update public.decks
    set deck_lists = v_next_children,
        updated_at = p_updated_at
    where user_id = v_user_id
      and id = v_current.deck_id;
  end if;

  return jsonb_build_object(
    'status', case when p_operation = 'create' then 'committed' else 'committed' end,
    'deckList', to_jsonb(v_current)
  );
end;
$function$;

revoke all on function public.commit_first_class_deck_list(text, text, jsonb, text, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.commit_first_class_deck_list(text, text, jsonb, text, timestamptz, timestamptz)
  to authenticated;

-- Attach/detach is a separate mutation boundary. It locks the list and both
-- strategies, updates the first-class association, and removes/adds the
-- compatibility JSON copy in the same transaction.
create or replace function public.set_deck_list_association(
  p_deck_list_id text,
  p_deck_id text,
  p_expected_updated_at timestamptz,
  p_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_new_deck_id text := nullif(btrim(p_deck_id), '');
  v_list public.deck_lists%rowtype;
  v_old_deck_id text;
  v_deck_lists jsonb;
  v_list_json jsonb;
  v_new_position integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if p_updated_at is null or p_expected_updated_at is null then
    raise exception using errcode = '22023', message = 'Association version is required.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':deck-list-mutations', 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':deck-list:update:' || p_deck_list_id, 0)
  );

  select * into v_list
  from public.deck_lists
  where user_id = v_user_id
    and id = p_deck_list_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Deck List could not be found.';
  end if;
  if v_list.updated_at is distinct from p_expected_updated_at or p_updated_at <= v_list.updated_at then
    raise exception using errcode = 'P0001', message = 'Deck List changed; refresh-and-retry before changing its association.';
  end if;

  v_old_deck_id := v_list.deck_id;
  if v_old_deck_id is not distinct from v_new_deck_id then
    return jsonb_build_object('status', 'committed', 'deckList', to_jsonb(v_list));
  end if;

  -- Lock both possible parent rows in id order so concurrent moves cannot
  -- deadlock by taking the old and new strategy locks in opposite order.
  perform 1
  from public.decks
  where user_id = v_user_id
    and id in (v_old_deck_id, v_new_deck_id)
  order by id
  for update;

  if v_new_deck_id is not null
    and not exists (
      select 1
      from public.decks
      where user_id = v_user_id and id = v_new_deck_id
    )
  then
    raise exception using errcode = '42501', message = 'Deck Strategy could not be found.';
  end if;

  select coalesce(min(position) - 1, 0)
  into v_new_position
  from public.deck_lists
  where user_id = v_user_id
    and deck_id is not distinct from v_new_deck_id
    and id <> v_list.id;

  if v_old_deck_id is not null then
    update public.decks as deck
    set deck_lists = coalesce(
      (
        select jsonb_agg(item.value order by item.ordinal)
        from jsonb_array_elements(
          case when jsonb_typeof(deck.deck_lists) = 'array' then deck.deck_lists else '[]'::jsonb end
        ) with ordinality as item(value, ordinal)
        where item.value ->> 'id' <> v_list.id
      ),
      '[]'::jsonb
    ),
    updated_at = p_updated_at
    where deck.user_id = v_user_id and deck.id = v_old_deck_id;
  end if;

  update public.deck_lists
  set deck_id = v_new_deck_id,
      position = v_new_position,
      updated_at = p_updated_at
  where user_id = v_user_id and id = v_list.id
  returning * into v_list;

  if v_new_deck_id is not null then
    v_list_json := jsonb_build_object(
      'id', v_list.id,
      'name', v_list.name,
      'format', v_list.format,
      'date', v_list.date,
      'createdBy', v_list.created_by,
      'notes', v_list.notes,
      'rawList', v_list.raw_list,
      'parsedCards', v_list.parsed_cards,
      'sortedCards', v_list.sorted_cards,
      'sortedCardsVersion', v_list.sorted_cards_version,
      'createdAt', v_list.created_at,
      'updatedAt', v_list.updated_at
    );
    select deck_lists into v_deck_lists from public.decks
    where user_id = v_user_id and id = v_new_deck_id for update;
    if exists (
      select 1 from jsonb_array_elements(coalesce(v_deck_lists, '[]'::jsonb)) as item(value)
      where item.value ->> 'id' = v_list.id
    ) then
      raise exception using errcode = '23505', message = 'Deck List association conflicts with an existing compatibility copy.';
    end if;
    update public.decks
    set deck_lists = jsonb_build_array(v_list_json) || case when jsonb_typeof(v_deck_lists) = 'array' then v_deck_lists else '[]'::jsonb end,
        updated_at = p_updated_at
    where user_id = v_user_id and id = v_new_deck_id;
  end if;

  select * into v_list from public.deck_lists where user_id = v_user_id and id = v_list.id;
  return jsonb_build_object('status', 'committed', 'deckList', to_jsonb(v_list));
end;
$function$;

revoke all on function public.set_deck_list_association(text, text, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.set_deck_list_association(text, text, timestamptz, timestamptz)
  to authenticated;

-- Preserve legacy-only references before a strategy is deleted. The helper is
-- deliberately conservative: ambiguous duplicate ids are cleared rather than
-- guessed, while an exact owned legacy child is adopted as a standalone row.
create or replace function public.preserve_deleted_deck_legacy_references(
  p_user_id uuid,
  p_deck_id text,
  p_deck_lists jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_item jsonb;
  v_list_id text;
  v_target_id text;
  v_legacy_count integer;
  v_existing public.deck_lists%rowtype;
  v_has_existing boolean;
begin
  if jsonb_typeof(p_deck_lists) is distinct from 'array' then
    return;
  end if;

  for v_item in
    select item.value
    from jsonb_array_elements(p_deck_lists) as item(value)
  loop
    v_list_id := nullif(btrim(v_item ->> 'id'), '');
    if v_list_id is null then
      continue;
    end if;

    select count(*)
    into v_legacy_count
    from jsonb_array_elements(p_deck_lists) as item(value)
    where item.value ->> 'id' = v_list_id;

    if v_legacy_count > 1 then
      update public.logs
      set linked_deck_id = null,
          linked_deck_list_id = null
      where user_id = p_user_id
        and linked_deck_id = p_deck_id
        and linked_deck_list_id = v_list_id;
      update public.tournaments
      set linked_deck_id = null,
          linked_deck_list_id = null
      where user_id = p_user_id
        and linked_deck_id = p_deck_id
        and linked_deck_list_id = v_list_id;
      continue;
    end if;

    v_existing := null;
    select *
    into v_existing
    from public.deck_lists
    where user_id = p_user_id
      and id = v_list_id
    for update;
    v_has_existing := found;

    if v_has_existing and v_existing.deck_id is not distinct from p_deck_id then
      v_target_id := v_list_id;
    else
      v_target_id := case
        when v_has_existing then gen_random_uuid()::text
        else v_list_id
      end;

      insert into public.deck_lists (
        user_id, id, deck_id, creation_key, name, format, date, created_by,
        notes, raw_list, parsed_cards, sorted_cards, sorted_cards_version,
        position, created_at, updated_at
      ) values (
        p_user_id,
        v_target_id,
        null,
        null,
        coalesce(v_item ->> 'name', ''),
        coalesce(v_item ->> 'format', ''),
        coalesce(v_item ->> 'date', ''),
        coalesce(v_item ->> 'createdBy', v_item ->> 'created_by', ''),
        coalesce(v_item ->> 'notes', ''),
        coalesce(v_item ->> 'rawList', v_item ->> 'raw_list', ''),
        coalesce(v_item -> 'parsedCards', v_item -> 'parsed_cards', '[]'::jsonb),
        coalesce(v_item -> 'sortedCards', v_item -> 'sorted_cards', '[]'::jsonb),
        case
          when coalesce(v_item ->> 'sortedCardsVersion', v_item ->> 'sorted_cards_version') ~ '^[0-9]+$'
            then coalesce(v_item ->> 'sortedCardsVersion', v_item ->> 'sorted_cards_version')::integer
          else null
        end,
        0,
        coalesce(
          nullif(coalesce(v_item ->> 'createdAt', v_item ->> 'created_at'), '')::timestamptz,
          now()
        ),
        now()
      );
    end if;

    update public.logs
    set linked_deck_id = null,
        linked_deck_list_id = v_target_id
    where user_id = p_user_id
      and linked_deck_id = p_deck_id
      and linked_deck_list_id = v_list_id;
    update public.tournaments
    set linked_deck_id = null,
        linked_deck_list_id = v_target_id
    where user_id = p_user_id
      and linked_deck_id = p_deck_id
      and linked_deck_list_id = v_list_id;
  end loop;

  -- A relational child explicitly owned by the deleted strategy is also an
  -- exact verified target, even when an older JSON copy was absent. Preserve
  -- that child as a standalone reference before ON DELETE SET NULL runs.
  update public.logs as log
  set linked_deck_id = null
  where log.user_id = p_user_id
    and log.linked_deck_id = p_deck_id
    and exists (
      select 1
      from public.deck_lists as deck_list
      where deck_list.user_id = p_user_id
        and deck_list.id = log.linked_deck_list_id
        and deck_list.deck_id = p_deck_id
    );

  update public.tournaments as tournament
  set linked_deck_id = null
  where tournament.user_id = p_user_id
    and tournament.linked_deck_id = p_deck_id
    and exists (
      select 1
      from public.deck_lists as deck_list
      where deck_list.user_id = p_user_id
        and deck_list.id = tournament.linked_deck_list_id
        and deck_list.deck_id = p_deck_id
    );

  -- An independently owned relational list remains a valid reference even
  -- when its optional strategy pairing is being deleted. Preserve the list id
  -- for standalone and other-strategy lists, without inferring from a legacy
  -- id or crossing the account boundary.
  update public.logs as log
  set linked_deck_id = null
  where log.user_id = p_user_id
    and log.linked_deck_id = p_deck_id
    and log.linked_deck_list_id is not null
    and exists (
      select 1
      from public.deck_lists as deck_list
      where deck_list.user_id = p_user_id
        and deck_list.id = log.linked_deck_list_id
    );

  update public.tournaments as tournament
  set linked_deck_id = null
  where tournament.user_id = p_user_id
    and tournament.linked_deck_id = p_deck_id
    and tournament.linked_deck_list_id is not null
    and exists (
      select 1
      from public.deck_lists as deck_list
      where deck_list.user_id = p_user_id
        and deck_list.id = tournament.linked_deck_list_id
    );

  -- Any remaining strategy reference has no verified relational list or
  -- exact legacy child. Clear both ids rather than guessing ownership.
  update public.logs as log
  set linked_deck_id = null,
      linked_deck_list_id = null
  where log.user_id = p_user_id
    and log.linked_deck_id = p_deck_id
    and not exists (
      select 1
      from public.deck_lists as deck_list
      where deck_list.user_id = p_user_id
        and deck_list.id = log.linked_deck_list_id
    );

  update public.tournaments as tournament
  set linked_deck_id = null,
      linked_deck_list_id = null
  where tournament.user_id = p_user_id
    and tournament.linked_deck_id = p_deck_id
    and not exists (
      select 1
      from public.deck_lists as deck_list
      where deck_list.user_id = p_user_id
        and deck_list.id = tournament.linked_deck_list_id
    );
end;
$function$;

revoke all on function public.preserve_deleted_deck_legacy_references(uuid, text, jsonb)
  from public, anon, authenticated;

-- Keep the previous application's direct Strategy DELETE usable during the
-- migration-first rollout. The trigger preserves legacy-only children and
-- repairs owner-scoped references before the parent row is removed. A direct
-- delete cannot acquire the shared advisory lock before PostgreSQL locks its
-- target row, so fail closed instead of waiting in the inverse order when a
-- first-class mutation already owns that serialization boundary.
create or replace function public.preserve_deleted_deck_references_before_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if not pg_try_advisory_xact_lock(
    hashtextextended(old.user_id::text || ':deck-list-mutations', 0)
  ) then
    raise exception using
      errcode = '55P03',
      message = 'Deck is busy; refresh and retry the deletion.';
  end if;

  perform public.preserve_deleted_deck_legacy_references(
    old.user_id,
    old.id,
    old.deck_lists
  );
  return old;
end;
$function$;

revoke all on function public.preserve_deleted_deck_references_before_delete()
  from public, anon, authenticated;
drop trigger if exists preserve_deleted_deck_references_before_delete on public.decks;
create trigger preserve_deleted_deck_references_before_delete
  before delete on public.decks
  for each row execute function public.preserve_deleted_deck_references_before_delete();

-- Strategy deletion must enter the same mutation boundary before PostgreSQL
-- takes ON DELETE SET NULL locks on child Deck Lists. The app calls this RPC;
-- the pre-delete trigger above keeps the previous direct-delete client safe
-- until the application has cut over to this RPC.
create or replace function public.delete_owned_deck(
  p_deck_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_deck_id text := nullif(btrim(p_deck_id), '');
  v_deleted_id text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if v_deck_id is null then
    raise exception using errcode = '22023', message = 'Deck id is required.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':deck-list-mutations', 0)
  );

  select id
  into v_deleted_id
  from public.decks
  where user_id = v_user_id
    and id = v_deck_id
  for update;

  if not found then
    return null;
  end if;

  delete from public.decks
  where user_id = v_user_id
    and id = v_deck_id;

  return jsonb_build_object('id', v_deleted_id);
end;
$function$;

revoke all on function public.delete_owned_deck(text) from public, anon;
grant execute on function public.delete_owned_deck(text) to authenticated;

-- Deletion is also a reviewed mutation boundary. The trigger clears same-account
-- log/tournament references and the legacy JSON copy after this row is locked.
create or replace function public.delete_first_class_deck_list(
  p_deck_list_id text,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_list public.deck_lists%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':deck-list-mutations', 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':deck-list:update:' || p_deck_list_id, 0)
  );

  select * into v_list
  from public.deck_lists
  where user_id = v_user_id
    and id = p_deck_list_id
  for update;
  if not found then
    return jsonb_build_object('status', 'not-found');
  end if;

  if p_expected_updated_at is null
    or v_list.updated_at is distinct from p_expected_updated_at
  then
    raise exception using
      errcode = 'P0001',
      message = 'Deck List changed; refresh-and-retry before deleting.';
  end if;

  delete from public.deck_lists
  where user_id = v_user_id
    and id = p_deck_list_id;

  return jsonb_build_object('status', 'committed', 'deckListId', p_deck_list_id);
end;
$function$;

revoke all on function public.delete_first_class_deck_list(text, timestamptz)
  from public, anon;
grant execute on function public.delete_first_class_deck_list(text, timestamptz)
  to authenticated;

-- Authenticated clients may read their own lists, but cannot bypass the
-- creation-key, optimistic-version, dual-write, or reference-cleanup RPCs.
revoke all privileges on table public.deck_lists from public, anon, authenticated;
grant select on table public.deck_lists to authenticated;

-- The optimized logs read model joins standalone relational lists by account
-- and keeps strategy-paired reads strategy-scoped before legacy fallback.
create or replace function public.get_initial_logs_page_data(p_limit integer default 51)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  with request_context as (
    select (select auth.uid()) as user_id
  ),
  stats as (
    select
      coalesce(user_log_stats.games_played, 0) as games_played,
      coalesce(user_log_stats.games_won, 0) as games_won,
      coalesce(user_log_stats.games_lost, 0) as games_lost
    from request_context
    left join public.user_log_stats
      on user_log_stats.user_id = request_context.user_id
  ),
  ordered_logs as (
    select logs.id, logs.date, logs.result, logs.format, logs.go_order,
      logs.self_player_name, logs.self_deck_name, logs.self_deck_sprites,
      logs.opponent_player_name, logs.opponent_deck_name, logs.opponent_deck_sprites,
      logs.total_turns, logs.linked_deck_id, logs.linked_deck_list_id,
      logs.imported_at, logs.user_id
    from public.logs
    cross join request_context
    where logs.user_id = request_context.user_id
    order by logs.date desc, logs.imported_at desc, logs.id desc
    limit greatest(1, least(coalesce(p_limit, 51), 101))
  ),
  enriched_logs as (
    select ordered_logs.id, ordered_logs.date, ordered_logs.result, ordered_logs.format,
      ordered_logs.go_order, ordered_logs.self_player_name, ordered_logs.self_deck_name,
      ordered_logs.self_deck_sprites, ordered_logs.opponent_player_name,
      ordered_logs.opponent_deck_name, ordered_logs.opponent_deck_sprites,
      ordered_logs.total_turns, ordered_logs.linked_deck_id,
      ordered_logs.linked_deck_list_id, ordered_logs.imported_at,
      coalesce(relational_list.name, aggregate_list.name) as linked_deck_list_name
    from ordered_logs
    left join public.deck_lists as relational_list
      on relational_list.user_id = ordered_logs.user_id
      and relational_list.id = ordered_logs.linked_deck_list_id
      and (
        ordered_logs.linked_deck_id is null
        or (
          select count(*)
          from public.decks as legacy_deck
          cross join lateral jsonb_array_elements(
            case
              when jsonb_typeof(legacy_deck.deck_lists) = 'array' then legacy_deck.deck_lists
              else '[]'::jsonb
            end
          ) as legacy_item(value)
          where legacy_deck.user_id = ordered_logs.user_id
            and legacy_deck.id = ordered_logs.linked_deck_id
            and legacy_item.value ->> 'id' = ordered_logs.linked_deck_list_id
        ) <> 1
      )
    left join public.decks
      on relational_list.id is null
      and decks.user_id = ordered_logs.user_id
      and decks.id = ordered_logs.linked_deck_id
    left join lateral (
      select max(deck_list ->> 'name') as name
      from jsonb_array_elements(
        case when jsonb_typeof(decks.deck_lists) = 'array' then decks.deck_lists else '[]'::jsonb end
      ) as deck_list
      where relational_list.id is null
        and deck_list ->> 'id' = ordered_logs.linked_deck_list_id
      having count(*) = 1
    ) as aggregate_list on true
  )
  select jsonb_build_object(
    'stats', jsonb_build_object(
      'games_played', stats.games_played,
      'games_won', stats.games_won,
      'games_lost', stats.games_lost
    ),
    'logs', coalesce(
      (select jsonb_agg(to_jsonb(enriched_logs)
        order by enriched_logs.date desc, enriched_logs.imported_at desc, enriched_logs.id desc)
       from enriched_logs),
      '[]'::jsonb
    )
  )
  from stats;
$function$;
revoke execute on function public.get_initial_logs_page_data(integer) from public, anon;
grant execute on function public.get_initial_logs_page_data(integer) to authenticated;

notify pgrst, 'reload schema';
