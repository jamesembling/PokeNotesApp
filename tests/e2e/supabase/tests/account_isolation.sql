begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(82);

-- These records are deliberately valid and visible to B before testing A.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'rls-a@pokenotes.local', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'rls-b@pokenotes.local', '', now(), '{}', '{}', now(), now());
insert into public.profiles (id, email, display_name, role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'rls-a@pokenotes.local', 'A profile', 'user'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'rls-b@pokenotes.local', 'B profile', 'user')
on conflict (id) do update set role = 'user';

insert into public.decks (id, user_id, deck_name) values
  ('rls-deck-a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A deck'),
  ('rls-deck-b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B deck');
insert into public.deck_lists (id, deck_id, user_id, name, raw_list) values
  ('rls-list-b', 'rls-deck-b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B list', '4 Mew ex');
insert into public.deck_matchups (id, deck_id, user_id, deck_name) values
  ('rls-matchup-b', 'rls-deck-b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B matchup');
insert into public.tournaments (id, user_id, name, date_from, date_to) values
  ('rls-tournament-a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A tournament', current_date, current_date),
  ('rls-tournament-b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B tournament', current_date, current_date);
insert into public.tournament_rounds (id, tournament_id, user_id, round_number, result) values
  ('rls-round-b', 'rls-tournament-b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 1, 'Win');
insert into public.logs (id, user_id, date, result) values
  ('rls-log-b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_date, 'Win');
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
insert into public.log_shares (id, owner_user_id, source_log_id, payload) values
  ('rls-share-b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'rls-log-b', '{"version":"v1","log":{"id":"rls-log-b","sections":[]},"linkedStrategyLabel":"B deck"}');
insert into public.tournament_deck_list_snapshots
  (id, tournament_id, user_id, request_id, payload_hash, sorted_cards_version)
values
  ('rls-snapshot-b', 'rls-tournament-b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'rls-snapshot-request-b', 'fixture', 2);
insert into public.battle_log_import_drafts
  (id, user_id, immutable_facts, initial_editable, expires_at)
values
  ('rls-draft-b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '{}', '{}', now() + interval '1 hour');
insert into public.user_event_pins (user_id, event_id, event_snapshot) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbbbbbbbbbbbbbbbbbb', '{}');
insert into public.user_event_preferences (user_id, search_query) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B private search');

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
select results_eq(
  $$select id::text from public.profiles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$,
  array['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'], 'B can read its own profile'
);
select results_eq(
  $$select id from public.tournament_deck_list_snapshots where id = 'rls-snapshot-b'$$,
  array['rls-snapshot-b'], 'B can read its own Tournament snapshot'
);
select results_eq(
  $$select event_id from public.user_event_pins where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$,
  array['bbbbbbbbbbbbbbbbbbbbbbbb'], 'B can read its own event pin'
);
select results_eq(
  $$select search_query from public.user_event_preferences where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$,
  array['B private search'], 'B can read its own event preferences'
);
select throws_ok($$select id from public.battle_log_import_drafts where id = 'rls-draft-b'$$,
  '42501', null, 'Even the draft owner cannot read server-owned import drafts directly');

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

select results_eq(
  $$select id::text from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], 'A can read its own profile'
);
select results_eq(
  $$select id::text from public.profiles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$,
  array[]::text[], 'A cannot read B profile'
);
select results_eq(
  $$update public.profiles set display_name = 'A edited' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning display_name$$,
  array['A edited'], 'A can edit its allowed profile field'
);
select throws_ok($$update public.profiles set role = 'admin' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  '42501', null, 'A cannot promote itself through direct profile UPDATE');
select throws_ok($$update public.profiles set last_login_at = now() where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  '42501', null, 'A cannot update protected login metadata');
select throws_ok($$insert into public.profiles (id, role) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'admin')$$,
  '42501', null, 'A cannot directly INSERT a profile');
select throws_ok($$select public.set_profile_role(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'admin'
)$$, '42501', null, 'A cannot execute the internal role RPC');
select is((select role from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'user', 'A remains a normal user after attempted self-promotion');

select results_eq(
  $$select id from public.tournament_deck_list_snapshots where id = 'rls-snapshot-b'$$,
  array[]::text[], 'A cannot read B Tournament snapshot'
);
select throws_ok($$insert into public.tournament_deck_list_snapshots
  (id, tournament_id, user_id, request_id, payload_hash, sorted_cards_version)
  values ('rls-snapshot-cross', 'rls-tournament-b', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'rls-snapshot-cross', 'fixture', 2)$$,
  '42501', null, 'A cannot directly create a Tournament snapshot');
select throws_ok($$update public.tournament_deck_list_snapshots set name = 'changed' where id = 'rls-snapshot-b'$$,
  '42501', null, 'A cannot directly update B Tournament snapshot');
select throws_ok($$delete from public.tournament_deck_list_snapshots where id = 'rls-snapshot-b'$$,
  '42501', null, 'A cannot directly delete B Tournament snapshot');

select throws_ok($$select id from public.battle_log_import_drafts where id = 'rls-draft-b'$$,
  '42501', null, 'A cannot read B server-owned import draft');
select throws_ok($$insert into public.battle_log_import_drafts
  (id, user_id, immutable_facts, initial_editable, expires_at)
  values ('rls-draft-cross', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '{}', '{}', now() + interval '1 hour')$$,
  '42501', null, 'A cannot directly insert a draft for B');
select throws_ok($$update public.battle_log_import_drafts set immutable_facts = '{}' where id = 'rls-draft-b'$$,
  '42501', null, 'A cannot update B import draft');
select throws_ok($$delete from public.battle_log_import_drafts where id = 'rls-draft-b'$$,
  '42501', null, 'A cannot delete B import draft');

select results_eq(
  $$select event_id from public.user_event_pins where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$,
  array[]::text[], 'A cannot read B event pins'
);
select throws_ok($$insert into public.user_event_pins (user_id, event_id, event_snapshot)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaaaaaaaaaaaaaaaaaa', '{}')$$,
  '42501', null, 'A cannot pin an event in B account');
select results_eq(
  $$delete from public.user_event_pins where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' returning event_id$$,
  array[]::text[], 'A cannot remove B event pin'
);
select throws_ok($$update public.user_event_pins set event_snapshot = '{}' where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$,
  '42501', null, 'A cannot directly update event pins');

select results_eq(
  $$select search_query from public.user_event_preferences where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$,
  array[]::text[], 'A cannot read B event preferences'
);
select throws_ok($$insert into public.user_event_preferences (user_id, search_query)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'stolen')$$,
  '42501', null, 'A cannot insert event preferences for B');
select results_eq(
  $$update public.user_event_preferences set search_query = 'stolen'
    where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' returning search_query$$,
  array[]::text[], 'A cannot update B event preferences'
);
select throws_ok($$delete from public.user_event_preferences where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$,
  '42501', null, 'A cannot delete event preferences directly');

select lives_ok($$insert into public.deck_matchups (id, deck_id, user_id, deck_name)
  values ('rls-own-matchup', 'rls-deck-a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A own matchup')$$,
  'A can directly add a matchup to its own Deck Strategy');
select throws_ok($$insert into public.deck_matchups (id, deck_id, user_id, deck_name)
  values ('rls-cross-matchup', 'rls-deck-b', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cross-parent')$$,
  '23503', null, 'A cannot attach its matchup to B Deck Strategy');
select lives_ok($$insert into public.tournament_rounds (id, tournament_id, user_id, round_number, result)
  values ('rls-own-round', 'rls-tournament-a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1, 'Win')$$,
  'A can directly add a round to its own Tournament');
select throws_ok($$insert into public.tournament_rounds (id, tournament_id, user_id, round_number, result)
  values ('rls-cross-round', 'rls-tournament-b', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 2, 'Win')$$,
  '23503', null, 'A cannot attach its round to B Tournament');
select throws_ok($$insert into public.deck_lists (id, deck_id, user_id, name, raw_list)
  values ('rls-cross-list', 'rls-deck-b', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cross-parent', '4 Mew ex')$$,
  '42501', null, 'A cannot directly insert a Deck List (write grant removed)');

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select id from public.log_shares$$,
  '42501', null, 'Anonymous visitor cannot enumerate share rows');
select throws_ok($$select id from public.logs$$,
  '42501', null, 'Anonymous visitor cannot read Battle Logs');
select results_eq(
  $$select id from public.get_active_log_share('rls-share-b')$$,
  array['rls-share-b'], 'Anonymous visitor can open a share with the exact active token'
);
select results_eq(
  $$select id from public.get_active_log_share('not-a-real-share-token')$$,
  array[]::text[], 'Invalid share token reveals no row'
);

reset role;
-- Command ledgers hold replay identities; only the security-definer RPCs may touch them.
select table_privs_are('public', ledger, client_role, array[]::text[],
  client_role || ' has no direct privileges on ' || ledger)
from unnest(array['tournament_deck_list_commands', 'tournament_metadata_commands', 'deck_strategy_commands']) as ledger
cross join unnest(array['anon', 'authenticated']) as client_role;

reset role;
set local role service_role;
select results_eq(
  $$select id from public.battle_log_import_drafts where id = 'rls-draft-b'$$,
  array['rls-draft-b'], 'Server role can see the B draft fixture that clients cannot'
);
select lives_ok($$insert into public.deck_lists (id, deck_id, user_id, name, raw_list)
  values ('rls-own-list', 'rls-deck-a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A list', '4 Mew ex')$$,
  'Privileged fixture can attach A Deck List to A Deck Strategy');
select throws_ok($$insert into public.deck_lists (id, deck_id, user_id, name, raw_list)
  values ('rls-cross-list-service', 'rls-deck-b', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cross-parent', '4 Mew ex')$$,
  '23503', null, 'Composite FK rejects A Deck List attached to B Deck Strategy even with table write privilege');

select * from finish();
rollback;
