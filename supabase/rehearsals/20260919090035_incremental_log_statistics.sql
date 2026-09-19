-- Synthetic behavioral verification for
-- 20260919090035_maintain_incremental_user_log_statistics.sql.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '33333333-3333-4333-8333-333333333333',
  'authenticated', 'authenticated', 'statistics-rehearsal@pokenotes.local', '',
  now(), '{}', '{}', now(), now()
);

insert into public.logs (
  id, user_id, date, result, coin_toss_won,
  self_attack_damage, opponent_attack_damage,
  self_mulligans, self_prizes_taken, opponent_prizes_taken
)
values
  (
    'statistics-rehearsal-win', '33333333-3333-4333-8333-333333333333',
    current_date, 'Win', true, 120, 60, 1, 6, 2
  ),
  (
    'statistics-rehearsal-loss', '33333333-3333-4333-8333-333333333333',
    current_date, 'Loss', false, 30, 180, 2, 1, 6
  );

do $$
declare
  totals public.user_log_stats%rowtype;
begin
  select * into strict totals
  from public.user_log_stats
  where user_id = '33333333-3333-4333-8333-333333333333';

  if (
    totals.games_played, totals.games_won, totals.games_lost,
    totals.attack_damage, totals.opponent_attack_damage,
    totals.coin_flips_won, totals.coin_flips_lost,
    totals.mulligans_taken, totals.prizes_taken,
    totals.tracked_damage, totals.tracked_prizes
  ) <> (2, 1, 1, 150, 240, 1, 1, 3, 7, 390, 15) then
    raise exception 'insert totals were not maintained incrementally';
  end if;

  update public.logs
  set result = 'Win', self_attack_damage = 80, opponent_attack_damage = 100
  where id = 'statistics-rehearsal-loss';

  select * into strict totals
  from public.user_log_stats
  where user_id = '33333333-3333-4333-8333-333333333333';
  if (
    totals.games_played, totals.games_won, totals.games_lost,
    totals.attack_damage, totals.opponent_attack_damage
  ) <> (2, 2, 0, 200, 160) then
    raise exception 'update deltas were not maintained incrementally';
  end if;

  delete from public.logs where id = 'statistics-rehearsal-win';
  select * into strict totals
  from public.user_log_stats
  where user_id = '33333333-3333-4333-8333-333333333333';
  if (
    totals.games_played, totals.games_won, totals.games_lost,
    totals.attack_damage, totals.opponent_attack_damage,
    totals.coin_flips_won, totals.coin_flips_lost
  ) <> (1, 1, 0, 80, 100, 0, 1) then
    raise exception 'delete deltas were not maintained incrementally';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_roles r on r.oid = p.proowner
    where n.nspname = 'public'
      and p.proname = 'sync_user_log_stats_from_log_row'
      and p.prosecdef
      and p.proconfig @> array['search_path=public']
      and r.rolname = 'postgres'
  ) then
    raise exception 'trigger function ownership or security contract is incorrect';
  end if;
end;
$$;
