-- Tournament deck-list creation used to span deck creation, aggregate-list
-- commit, and tournament linking in separate HTTP requests. Keep all three
-- writes in one transaction and lock the owned tournament as the aggregate
-- root so retries and concurrent submissions cannot leave partial records.

create or replace function public.commit_tournament_deck_list(
  p_tournament_id text,
  p_deck_id text,
  p_deck_name text,
  p_archetype_id text,
  p_format text,
  p_deck_sprites jsonb,
  p_deck_list jsonb,
  p_updated_at timestamptz
)
returns text
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_linked_deck_id text;
  v_linked_deck_list_id text;
  v_tournament_deck_sprites jsonb;
  v_tournament_format text;
  v_deck_id text;
  v_commit_result text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if nullif(btrim(p_tournament_id), '') is null
    or nullif(btrim(p_deck_id), '') is null
    or nullif(btrim(p_deck_name), '') is null
    or nullif(btrim(p_archetype_id), '') is null
    or p_updated_at is null
  then
    raise exception using errcode = '22023', message = 'Tournament deck-list input is incomplete.';
  end if;

  if p_deck_list is null or jsonb_typeof(p_deck_list) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Tournament deck list is invalid.';
  end if;

  select
    tournament.linked_deck_id,
    tournament.linked_deck_list_id,
    tournament.deck_sprites,
    tournament.format
  into
    v_linked_deck_id,
    v_linked_deck_list_id,
    v_tournament_deck_sprites,
    v_tournament_format
  from public.tournaments as tournament
  where tournament.id = p_tournament_id
    and tournament.user_id = v_user_id
  for update;

  if not found then
    return 'tournament-not-found';
  end if;

  if nullif(btrim(coalesce(v_linked_deck_list_id, '')), '') is not null then
    return 'already-linked';
  end if;

  if jsonb_typeof(v_tournament_deck_sprites) is distinct from 'array'
    or jsonb_array_length(v_tournament_deck_sprites) not between 1 and 2
  then
    raise exception using errcode = '22023', message = 'Tournament Pokemon are invalid.';
  end if;

  if p_deck_sprites is distinct from v_tournament_deck_sprites then
    raise exception using errcode = '22023', message = 'Tournament Pokemon changed. Refresh and try again.';
  end if;

  v_deck_id := coalesce(nullif(btrim(v_linked_deck_id), ''), p_deck_id);

  if nullif(btrim(coalesce(v_linked_deck_id, '')), '') is null then
    insert into public.decks (
      id,
      user_id,
      deck_name,
      archetype_id,
      format,
      go_preference,
      deck_pokemon,
      core_strategy,
      general_notes,
      setup_goals,
      resource_plan,
      matchups,
      deck_lists,
      created_at,
      updated_at
    ) values (
      v_deck_id,
      v_user_id,
      p_deck_name,
      p_archetype_id,
      coalesce(nullif(btrim(v_tournament_format), ''), btrim(p_format), ''),
      '',
      v_tournament_deck_sprites,
      '',
      '',
      '[]'::jsonb,
      '',
      '[]'::jsonb,
      '[]'::jsonb,
      p_updated_at,
      p_updated_at
    );
  end if;

  v_commit_result := public.commit_deck_aggregate_child(
    v_deck_id,
    'deck-list',
    'create',
    p_deck_list,
    '',
    p_updated_at
  );

  if v_commit_result is distinct from 'committed' then
    raise exception using
      errcode = '40001',
      message = 'Tournament deck-list transaction could not be committed.',
      detail = coalesce(v_commit_result, 'unexpected-null-status');
  end if;

  update public.tournaments as tournament
  set
    linked_deck_id = v_deck_id,
    linked_deck_list_id = p_deck_list ->> 'id',
    deck_name = p_deck_name,
    deck_sprites = v_tournament_deck_sprites
  where tournament.id = p_tournament_id
    and tournament.user_id = v_user_id;

  if not found then
    raise exception using errcode = '40001', message = 'Tournament changed during deck-list commit.';
  end if;

  return 'committed';
end;
$function$;

comment on function public.commit_tournament_deck_list(
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  timestamptz
) is
  'Atomically creates or reuses an owned deck, commits its ordered deck list, and links it to one owned tournament.';

revoke all on function public.commit_tournament_deck_list(
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.commit_tournament_deck_list(
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  timestamptz
) to authenticated;

-- Allocate a new round while holding a lock on the owned tournament. All app
-- creates pass through this function, so concurrent submissions serialize
-- before MAX(round_number) is read and cannot choose the same next number.

create or replace function public.create_tournament_round(
  p_tournament_id text,
  p_round_id text,
  p_opponent_deck_name text,
  p_opponent_deck_sprites jsonb,
  p_result text,
  p_notes text
)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_round_number integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if nullif(btrim(p_tournament_id), '') is null
    or nullif(btrim(p_round_id), '') is null
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

  perform 1
  from public.tournaments as tournament
  where tournament.id = p_tournament_id
    and tournament.user_id = v_user_id
  for update;

  if not found then
    return null;
  end if;

  select coalesce(max(round.round_number), 0) + 1
  into v_round_number
  from public.tournament_rounds as round
  where round.tournament_id = p_tournament_id
    and round.user_id = v_user_id;

  insert into public.tournament_rounds (
    id,
    tournament_id,
    user_id,
    round_number,
    opponent_deck_name,
    opponent_deck_sprites,
    result,
    notes
  ) values (
    p_round_id,
    p_tournament_id,
    v_user_id,
    v_round_number,
    coalesce(p_opponent_deck_name, ''),
    p_opponent_deck_sprites,
    p_result,
    coalesce(p_notes, '')
  );

  return v_round_number;
end;
$function$;

comment on function public.create_tournament_round(text, text, text, jsonb, text, text) is
  'Creates the next numbered round for one owned tournament under a parent-row concurrency lock.';

revoke all on function public.create_tournament_round(text, text, text, jsonb, text, text)
  from public, anon, authenticated;

grant execute on function public.create_tournament_round(text, text, text, jsonb, text, text)
  to authenticated;

notify pgrst, 'reload schema';
