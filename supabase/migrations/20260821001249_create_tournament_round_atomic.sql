-- Allocate a new round while holding the owned tournament row lock. This is
-- deliberately independent of deck/list orchestration; those writes remain
-- on their existing compatibility path until the domain decision is settled.

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
    raise exception using errcode = 'P0002', message = 'Tournament could not be found.';
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
