-- Keep the current RPC signature compatible with both application versions.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Creation receipts survive edits and deliberate Round/Tournament deletion.
-- Only account deletion removes the identity; replay never re-creates evidence.
create table public.tournament_round_commands (
  user_id uuid not null references auth.users(id) on delete cascade,
  creation_key text not null,
  tournament_id text not null,
  round_id text not null,
  payload_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, creation_key)
);
alter table public.tournament_round_commands enable row level security;
revoke all on public.tournament_round_commands from public, anon, authenticated;
grant all on public.tournament_round_commands to service_role;

-- Freeze existing keyed rows at release. Older original payloads cannot be
-- reconstructed after edits; the current values become their retry baseline.
lock table public.tournament_rounds in share row exclusive mode;
insert into public.tournament_round_commands (
  user_id, creation_key, tournament_id, round_id, payload_hash, result, created_at
)
select user_id, creation_key, tournament_id, id,
  md5(jsonb_build_object(
    'tournamentId', tournament_id,
    'opponentDeckName', opponent_deck_name,
    'opponentDeckSprites', opponent_deck_sprites,
    'result', result,
    'notes', notes
  )::text),
  jsonb_build_object('status', 'committed', 'roundId', id, 'roundNumber', round_number),
  created_at
from public.tournament_rounds
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
  v_command public.tournament_round_commands%rowtype;
  v_result jsonb;
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

  -- Different tournaments can race on the same account-scoped request key.
  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':tournament-round-request:' || p_creation_key, 0)
  );

  v_fingerprint := md5(jsonb_build_object(
    'tournamentId', p_tournament_id,
    'opponentDeckName', coalesce(p_opponent_deck_name, ''),
    'opponentDeckSprites', p_opponent_deck_sprites,
    'result', p_result,
    'notes', coalesce(p_notes, '')
  )::text);
  select * into v_command
  from public.tournament_round_commands
  where user_id = v_user_id and creation_key = p_creation_key;
  if found then
    if v_command.payload_hash <> v_fingerprint then
      raise exception using errcode = '23505', message = 'That Tournament round request id was already used with different values.';
    end if;
    return jsonb_set(v_command.result, '{status}', '"idempotent"'::jsonb);
  end if;

  perform 1 from public.tournaments
    where id = p_tournament_id and user_id = v_user_id
    for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Tournament could not be found.';
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
  v_result := jsonb_build_object('status', 'committed', 'roundId', p_round_id, 'roundNumber', v_round_number);
  insert into public.tournament_round_commands (
    user_id, creation_key, tournament_id, round_id, payload_hash, result
  ) values (
    v_user_id, p_creation_key, p_tournament_id, p_round_id, v_fingerprint, v_result
  );
  return v_result;
end;
$function$;

revoke all on function public.create_tournament_round_idempotent(
  text, text, text, text, jsonb, text, text
) from public, anon;
grant execute on function public.create_tournament_round_idempotent(
  text, text, text, text, jsonb, text, text
) to authenticated;

notify pgrst, 'reload schema';
commit;
