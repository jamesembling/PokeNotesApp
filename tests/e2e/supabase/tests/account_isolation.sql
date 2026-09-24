begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(35);

-- These records are deliberately valid and visible to B before testing A.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'rls-a@pokenotes.local', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'rls-b@pokenotes.local', '', now(), '{}', '{}', now(), now());

insert into public.decks (id, user_id, deck_name) values
  ('rls-deck-b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B deck');
insert into public.deck_lists (id, deck_id, user_id, name, raw_list) values
  ('rls-list-b', 'rls-deck-b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B list', '4 Mew ex');
insert into public.deck_matchups (id, deck_id, user_id, deck_name) values
  ('rls-matchup-b', 'rls-deck-b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B matchup');
insert into public.tournaments (id, user_id, name, date_from, date_to) values
  ('rls-tournament-b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B tournament', current_date, current_date);
insert into public.tournament_rounds (id, tournament_id, user_id, round_number, result) values
  ('rls-round-b', 'rls-tournament-b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 1, 'Win');
insert into public.logs (id, user_id, date, result) values
  ('rls-log-b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_date, 'Win');
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
insert into public.log_shares (id, owner_user_id, source_log_id, payload) values
  ('rls-share-b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'rls-log-b', '{"version":"v1","log":{"id":"rls-log-b","sections":[]},"linkedStrategyLabel":"B deck"}');

create temporary table isolation_cases (
  relation_name text not null,
  record_id text not null,
  foreign_insert text not null,
  can_update boolean not null default true,
  can_delete boolean not null default true
) on commit drop;
grant select on isolation_cases to authenticated;
insert into isolation_cases values
  ('logs', 'rls-log-b', $$insert into public.logs (id, user_id, date, result) values ('rls-log-a-for-b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_date, 'Win')$$, true, true),
  ('decks', 'rls-deck-b', $$insert into public.decks (id, user_id, deck_name) values ('rls-deck-a-for-b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'stolen')$$, true, true),
  ('deck_lists', 'rls-list-b', $$insert into public.deck_lists (id, deck_id, user_id, name, raw_list) values ('rls-list-a-for-b', 'rls-deck-b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'stolen', '4 Mew ex')$$, false, false),
  ('deck_matchups', 'rls-matchup-b', $$insert into public.deck_matchups (id, deck_id, user_id, deck_name) values ('rls-matchup-a-for-b', 'rls-deck-b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'stolen')$$, true, true),
  ('tournaments', 'rls-tournament-b', $$insert into public.tournaments (id, user_id, name, date_from, date_to) values ('rls-tournament-a-for-b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'stolen', current_date, current_date)$$, true, true),
  ('tournament_rounds', 'rls-round-b', $$insert into public.tournament_rounds (id, tournament_id, user_id, round_number, result) values ('rls-round-a-for-b', 'rls-tournament-b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 2, 'Win')$$, true, true),
  ('log_shares', 'rls-share-b', $$insert into public.log_shares (id, owner_user_id, source_log_id, payload) values ('rls-share-a-for-b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'rls-log-b', '{"version":"v1","log":{"id":"rls-log-b","sections":[]},"linkedStrategyLabel":"B deck"}')$$, false, true);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
select results_eq(
  format('select id from public.%I where id = %L', relation_name, record_id),
  array[record_id], relation_name || ': B can read its own row'
) from isolation_cases;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select results_eq(
  format('select id from public.%I where id = %L', relation_name, record_id),
  array[]::text[], relation_name || ': A cannot read B row'
) from isolation_cases;
select throws_ok(
  foreign_insert, '42501', null, relation_name || ': A cannot insert as B'
) from isolation_cases;
select case when can_update then
  results_eq(
    format('update public.%I set updated_at = now() where id = %L returning id', relation_name, record_id),
    array[]::text[], relation_name || ': A cannot update B row'
  )
else
  throws_ok(
    format('update public.%I set updated_at = now() where id = %L', relation_name, record_id),
    '42501', null, relation_name || ': A cannot update B row (no UPDATE grant)'
  )
end from isolation_cases;
select case when can_delete then
  results_eq(
    format('delete from public.%I where id = %L returning id', relation_name, record_id),
    array[]::text[], relation_name || ': A cannot delete B row'
  )
else
  throws_ok(
    format('delete from public.%I where id = %L', relation_name, record_id),
    '42501', null, relation_name || ': A cannot delete B row (no DELETE grant)'
  )
end from isolation_cases;

select * from finish();
rollback;
