create table public.battle_log_import_drafts (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  immutable_facts jsonb not null,
  initial_editable jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_idempotency_key text,
  consumed_fingerprint text,
  battle_log_id text references public.logs(id) on delete cascade,
  consumed_at timestamptz,
  constraint battle_log_import_drafts_expiry_order
    check (expires_at > created_at),
  constraint battle_log_import_drafts_consumption_complete
    check (
      (consumed_idempotency_key is null
        and consumed_fingerprint is null
        and battle_log_id is null
        and consumed_at is null)
      or
      (consumed_idempotency_key is not null
        and consumed_fingerprint is not null
        and battle_log_id is not null
        and consumed_at is not null)
    )
);

comment on table public.battle_log_import_drafts is
  'Temporary server-owned parser output used by the Battle Log review-to-save workflow.';

create index battle_log_import_drafts_user_expiry_idx
  on public.battle_log_import_drafts (user_id, expires_at);

alter table public.battle_log_import_drafts enable row level security;
revoke all on table public.battle_log_import_drafts from public, anon, authenticated;
grant all privileges on table public.battle_log_import_drafts to service_role;

grant execute on function public.can_use_deck_list_reference(uuid, text, text)
  to service_role;

create or replace function public.commit_battle_log_import_draft(
  p_user_id uuid,
  p_draft_id text,
  p_idempotency_key text,
  p_editable jsonb,
  p_resolved jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_draft public.battle_log_import_drafts%rowtype;
  v_fingerprint text;
  v_log_id text := gen_random_uuid()::text;
  v_linked_deck_id text := nullif(btrim(p_editable ->> 'linkedDeckId'), '');
  v_linked_deck_list_id text := nullif(btrim(p_editable ->> 'linkedDeckListId'), '');
begin
  if p_user_id is null
    or nullif(btrim(p_draft_id), '') is null
    or length(p_draft_id) > 128
    or nullif(btrim(p_idempotency_key), '') is null
    or length(p_idempotency_key) > 128 then
    raise exception using errcode = '22023', message = 'The Battle Log import save identity is invalid.';
  end if;

  if jsonb_typeof(p_editable) <> 'object'
    or not (p_editable ?& array[
      'selfDeckSlug', 'selfDeckSprites', 'opponentDeckSlug', 'opponentDeckSprites',
      'date', 'format', 'linkedDeckId', 'linkedDeckListId', 'matchNotes'
    ])
    or (p_editable - array[
      'selfDeckSlug', 'selfDeckSprites', 'opponentDeckSlug', 'opponentDeckSprites',
      'date', 'format', 'linkedDeckId', 'linkedDeckListId', 'matchNotes'
    ]) <> '{}'::jsonb
    or jsonb_typeof(p_editable -> 'selfDeckSprites') <> 'array'
    or jsonb_array_length(p_editable -> 'selfDeckSprites') > 2
    or jsonb_typeof(p_editable -> 'opponentDeckSprites') <> 'array'
    or jsonb_array_length(p_editable -> 'opponentDeckSprites') > 2
    or (p_editable ->> 'date') !~ '^\d{4}-\d{2}-\d{2}$'
    or length(p_editable ->> 'format') > 256
    or length(coalesce(p_editable ->> 'matchNotes', '')) > 10000 then
    raise exception using errcode = '22023', message = 'The Battle Log review values are invalid.';
  end if;

  if jsonb_typeof(p_resolved) <> 'object'
    or not (p_resolved ?& array[
      'selfDeckName', 'selfDeckSlug', 'selfDeckSprites',
      'opponentDeckName', 'opponentDeckSlug', 'opponentDeckSprites'
    ]) then
    raise exception using errcode = '22023', message = 'The resolved Battle Log labels are invalid.';
  end if;

  select *
  into v_draft
  from public.battle_log_import_drafts
  where id = p_draft_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'This Battle Log review is unavailable. Import the complete log again.';
  end if;
  if v_draft.user_id <> p_user_id then
    raise exception using errcode = '42501', message = 'This Battle Log review belongs to a different account.';
  end if;

  v_fingerprint := encode(
    extensions.digest(
      jsonb_build_object('draftId', p_draft_id, 'editable', p_editable)::text,
      'sha256'
    ),
    'hex'
  );

  if v_draft.consumed_idempotency_key is not null then
    if v_draft.consumed_idempotency_key = p_idempotency_key
      and v_draft.consumed_fingerprint = v_fingerprint then
      return jsonb_build_object(
        'battleLogId', v_draft.battle_log_id,
        'created', false,
        'status', 'replay'
      );
    end if;
    if v_draft.consumed_idempotency_key = p_idempotency_key then
      raise exception using errcode = '23505', message = 'That save identity was already used with different review values.';
    end if;
    raise exception using errcode = 'P0001', message = 'This Battle Log review has already been saved.';
  end if;

  if statement_timestamp() >= v_draft.expires_at then
    raise exception using errcode = 'P0001', message = 'This Battle Log review has expired. Import the complete log again.';
  end if;

  if not public.can_use_deck_list_reference(
    p_user_id,
    v_linked_deck_id,
    v_linked_deck_list_id
  ) then
    raise exception using errcode = '23503', message = 'The selected Deck Strategy or Deck List is unavailable.';
  end if;

  insert into public.logs (
    id, user_id, date, result, format, go_order,
    self_player_name, self_deck_name, self_deck_slug, self_deck_sprites,
    opponent_player_name, opponent_deck_name, opponent_deck_slug, opponent_deck_sprites,
    total_turns, coin_toss_won, self_prizes_taken, opponent_prizes_taken,
    self_attack_damage, opponent_attack_damage, self_mulligans, opponent_mulligans,
    linked_deck_id, linked_deck_list_id, match_notes, reason, raw_log, sections
  ) values (
    v_log_id,
    p_user_id,
    (p_editable ->> 'date')::date,
    v_draft.immutable_facts ->> 'result',
    p_editable ->> 'format',
    v_draft.immutable_facts ->> 'goOrder',
    v_draft.immutable_facts ->> 'selfPlayerName',
    p_resolved ->> 'selfDeckName',
    p_resolved ->> 'selfDeckSlug',
    coalesce((select string_agg(value, ',' order by ordinal)
      from jsonb_array_elements_text(p_resolved -> 'selfDeckSprites') with ordinality as sprite(value, ordinal)), ''),
    v_draft.immutable_facts ->> 'opponentPlayerName',
    p_resolved ->> 'opponentDeckName',
    p_resolved ->> 'opponentDeckSlug',
    coalesce((select string_agg(value, ',' order by ordinal)
      from jsonb_array_elements_text(p_resolved -> 'opponentDeckSprites') with ordinality as sprite(value, ordinal)), ''),
    coalesce((v_draft.immutable_facts ->> 'totalTurns')::integer, 0),
    case
      when jsonb_typeof(v_draft.immutable_facts -> 'coinTossWon') = 'boolean'
        then (v_draft.immutable_facts ->> 'coinTossWon')::boolean
      else null
    end,
    coalesce((v_draft.immutable_facts ->> 'selfPrizesTaken')::integer, 0),
    coalesce((v_draft.immutable_facts ->> 'opponentPrizesTaken')::integer, 0),
    coalesce((v_draft.immutable_facts ->> 'selfAttackDamage')::integer, 0),
    coalesce((v_draft.immutable_facts ->> 'opponentAttackDamage')::integer, 0),
    coalesce((v_draft.immutable_facts ->> 'selfMulligans')::integer, 0),
    coalesce((v_draft.immutable_facts ->> 'opponentMulligans')::integer, 0),
    v_linked_deck_id,
    v_linked_deck_list_id,
    nullif(btrim(p_editable ->> 'matchNotes'), ''),
    v_draft.immutable_facts ->> 'reason',
    v_draft.immutable_facts ->> 'rawLog',
    v_draft.immutable_facts -> 'sections'
  );

  update public.battle_log_import_drafts
  set consumed_idempotency_key = p_idempotency_key,
      consumed_fingerprint = v_fingerprint,
      battle_log_id = v_log_id,
      consumed_at = statement_timestamp()
  where id = p_draft_id;

  return jsonb_build_object(
    'battleLogId', v_log_id,
    'created', true,
    'status', 'created'
  );
end;
$function$;

revoke all on function public.commit_battle_log_import_draft(uuid, text, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.commit_battle_log_import_draft(uuid, text, text, jsonb, jsonb)
  to service_role;
