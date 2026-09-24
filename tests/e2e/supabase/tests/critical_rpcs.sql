begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(29);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'authenticated', 'authenticated', 'rpc-a@pokenotes.local', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'authenticated', 'authenticated', 'rpc-b@pokenotes.local', '', now(), '{}', '{}', now(), now());
insert into public.profiles (id, email, role) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'rpc-a@pokenotes.local', 'admin'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'rpc-b@pokenotes.local', 'user')
on conflict (id) do update set role = excluded.role;
insert into public.decks (id, user_id, deck_name) values
  ('rpc-deck-a', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'A deck');
insert into public.tournaments (id, user_id, name, date_from, date_to) values
  ('rpc-tournament-a', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'A tournament', current_date, current_date);
insert into public.logs (id, user_id, date, result) values
  ('rpc-log-a', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', current_date, 'Win');

create temporary table rpc_payloads (name text primary key, payload jsonb not null) on commit drop;
grant select on rpc_payloads to authenticated;
insert into rpc_payloads values
  ('matchup', '{"id":"rpc-matchup-a","deckName":"Opponent","deckPokemon":["mew-ex"],"format":"Standard","goPreference":"","updatedAt":"2026-09-24T00:00:00Z","createdAt":"2026-09-24T00:00:00Z"}'),
  ('first-class', '{"id":"rpc-list-a","creationKey":"rpc-list-a","name":"A list","format":"Standard","date":"2026-09-24","createdBy":"Fixture","rawList":"4 Mew ex","parsedCards":[{"name":"Mew ex","count":4,"category":"Pokemon"}],"sortedCards":[{"name":"Mew ex","count":4,"category":"Pokemon"}],"sortedCardsVersion":2}'),
  ('snapshot', '{"id":"rpc-snapshot-list-a","creationKey":"rpc-snapshot-list-a","name":"Tournament list","format":"Standard","date":"2026-09-24","createdBy":"Fixture","rawList":"4 Mew ex","parsedCards":[{"name":"Mew ex","count":4,"category":"Pokemon"}],"sortedCards":[{"name":"Mew ex","count":4,"category":"Pokemon"}],"sortedCardsVersion":2}'),
  ('share', '{"version":"v1","log":{"id":"rpc-log-a","sections":[]},"linkedStrategyLabel":"A deck"}');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', true);

select is(public.commit_deck_aggregate_child(
  'rpc-deck-a', 'matchup', 'create', (select payload from rpc_payloads where name = 'matchup'),
  null, '2026-09-24T00:00:00Z'::timestamptz
), 'committed', 'Deck Aggregate child commits');
select is(
  (select count(*) from public.deck_matchups where id = 'rpc-matchup-a'),
  1::bigint, 'Deck Aggregate child reaches the relational store'
);
select is(
  (select count(*) from public.decks where id = 'rpc-deck-a' and matchups @> '[{"id":"rpc-matchup-a"}]'::jsonb),
  1::bigint, 'Deck Aggregate child reaches the legacy copy'
);

select is(
  public.commit_first_class_deck_list(
    null, 'create', (select payload from rpc_payloads where name = 'first-class'),
    'rpc-list-a', null, '2026-09-24T00:00:00Z'::timestamptz
  ) ->> 'status', 'committed', 'First-class Deck List creates an owned row'
);
select is((select count(*) from public.deck_lists where id = 'rpc-list-a' and deck_id is null),
  1::bigint, 'First-class Deck List remains standalone');
select is(
  public.commit_first_class_deck_list(
    null, 'create', (select payload from rpc_payloads where name = 'first-class'),
    'rpc-list-a', null, '2026-09-24T00:00:00Z'::timestamptz
  ) ->> 'status', 'idempotent', 'First-class Deck List replay preserves identity'
);
select throws_ok($$
  select public.commit_first_class_deck_list(
    null, 'create', (select payload || '{"name":"changed"}'::jsonb from rpc_payloads where name = 'first-class'),
    'rpc-list-a', null, '2026-09-24T00:00:00Z'::timestamptz
  )
$$, '23505', null, 'First-class Deck List rejects changed payload under the same key');

select is(
  public.create_tournament_round_idempotent(
    'rpc-tournament-a', 'rpc-round-a', 'rpc-round-key-a', 'Opponent', '["mew-ex"]', 'Win', 'first'
  ) ->> 'status', 'committed', 'Tournament round commits'
);
select is(
  public.create_tournament_round_idempotent(
    'rpc-tournament-a', 'rpc-round-replay', 'rpc-round-key-a', 'Opponent', '["mew-ex"]', 'Win', 'first'
  ) ->> 'roundId', 'rpc-round-a', 'Tournament round replay returns the original row'
);
select throws_ok($$
  select public.create_tournament_round_idempotent(
    'rpc-tournament-a', 'rpc-round-conflict', 'rpc-round-key-a', 'Opponent', '["mew-ex"]', 'Win', 'changed'
  )
$$, '23505', null, 'Tournament round rejects conflicting retry');
select is((select count(*) from public.tournament_rounds where tournament_id = 'rpc-tournament-a'),
  1::bigint, 'Tournament round retries leave one row');

select is(
  public.commit_tournament_deck_list(
    'rpc-tournament-a', 'rpc-snapshot-key-a', (select payload from rpc_payloads where name = 'snapshot'),
    (select updated_at from public.tournaments where id = 'rpc-tournament-a'),
    'A deck', '["mew-ex"]'
  ) ->> 'status', 'committed', 'Tournament Deck List captures a snapshot'
);
select is((select count(*) from public.tournament_deck_list_snapshots where tournament_id = 'rpc-tournament-a'),
  1::bigint, 'Tournament Deck List has exactly one snapshot');
select is(
  public.commit_tournament_deck_list(
    'rpc-tournament-a', 'rpc-snapshot-key-a', (select payload from rpc_payloads where name = 'snapshot'),
    (select updated_at from public.tournaments where id = 'rpc-tournament-a'),
    'A deck', '["mew-ex"]'
  ) ->> 'status', 'idempotent', 'Tournament Deck List replay preserves the snapshot'
);

select is(
  (select id from public.create_log_share(
    'rpc_share_token_aaaa', 'rpc-log-a', (select payload from rpc_payloads where name = 'share')
  )), 'rpc_share_token_aaaa', 'Log share creation returns the new token'
);
select is(
  (select id from public.create_log_share(
    'rpc_share_token_retry', 'rpc-log-a', (select payload from rpc_payloads where name = 'share')
  )), 'rpc_share_token_aaaa', 'Log share retry returns the active token'
);

select set_config('request.jwt.claim.sub', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', true);
select is(public.commit_deck_aggregate_child(
  'rpc-deck-a', 'matchup', 'create',
  (select payload || '{"id":"rpc-cross-matchup"}'::jsonb from rpc_payloads where name = 'matchup'),
  null, '2026-09-24T00:00:00Z'::timestamptz
), 'deck-not-found', 'Deck Aggregate RPC cannot write another account parent');
select throws_ok($$
  select public.commit_first_class_deck_list(
    'rpc-deck-a', 'create',
    (select payload || '{"id":"rpc-cross-list","creationKey":"rpc-cross-list"}'::jsonb from rpc_payloads where name = 'first-class'),
    'rpc-cross-list', null, '2026-09-24T00:00:00Z'::timestamptz
  )
$$, '42501', null, 'First-class Deck List RPC rejects another account strategy');
select throws_ok($$
  select public.create_tournament_round_idempotent(
    'rpc-tournament-a', 'rpc-cross-round', 'rpc-cross-round-key', 'Opponent', '["mew-ex"]', 'Win', ''
  )
$$, 'P0002', null, 'Tournament round RPC rejects another account tournament');
select throws_ok($$
  select public.commit_tournament_deck_list(
    'rpc-tournament-a', 'rpc-cross-snapshot-key',
    (select payload || '{"id":"rpc-cross-snapshot-list","creationKey":"rpc-cross-snapshot-list"}'::jsonb from rpc_payloads where name = 'snapshot'),
    now(), 'A deck', '["mew-ex"]'
  )
$$, 'P0002', null, 'Tournament Deck List RPC rejects another account tournament');
select throws_ok($$
  select * from public.create_log_share(
    'rpc_share_cross_account', 'rpc-log-a', (select payload from rpc_payloads where name = 'share')
  )
$$, 'P0001', null, 'Log share RPC rejects another account source log');
select is(public.revoke_log_share('rpc_share_token_aaaa'), false,
  'Log share RPC cannot revoke another account token');

select set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', true);
select is(public.revoke_log_share('rpc_share_token_aaaa'), true,
  'Log share owner can revoke its token');
select is((select count(*) from public.log_shares where source_log_id = 'rpc-log-a'),
  0::bigint, 'Revocation removes active shares for the source');

reset role;
set local role service_role;
select throws_ok($$
  select public.set_profile_role(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'user'
  )
$$, 'P0001', null, 'The only admin cannot demote itself');
select lives_ok($$
  select public.set_profile_role(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'admin'
  )
$$, 'An admin can promote a second admin');
select lives_ok($$
  select public.set_profile_role(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'user'
  )
$$, 'One of two admins may step down');
select is((select count(*) from public.profiles where role = 'admin'),
  1::bigint, 'Role changes retain exactly one admin');
select throws_ok($$
  select public.set_profile_role(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'user'
  )
$$, '42501', null, 'A non-admin actor cannot change another profile role');

select * from finish();
rollback;
