begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(40);

insert into auth.users(id, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
('11111111-1111-4111-8111-111111111111', 'social-a@pokenotes.local', '{}','{}',now(),now()),
('22222222-2222-4222-8222-222222222222', 'social-b@pokenotes.local', '{}','{}',now(),now());
insert into public.profiles(id, display_name, email, last_login_at) values
('11111111-1111-4111-8111-111111111111', 'Private A Name', 'social-a@pokenotes.local', '2026-10-01T12:00:00Z'),
('22222222-2222-4222-8222-222222222222', 'Private B Name', 'social-b@pokenotes.local', '2026-10-01T12:00:00Z');
insert into public.pokemon_catalog(slug,label) values('social-pikachu','Synthetic Pikachu');
insert into public.logs(id,user_id,date,result) values
('social-win','22222222-2222-4222-8222-222222222222','2026-10-01','Win'),
('social-loss','22222222-2222-4222-8222-222222222222','2026-10-01','Loss');

set local role anon;
select throws_ok($$select public.get_player_profile('22222222-2222-4222-8222-222222222222')$$,'42501',null,'Anonymous readers cannot execute member projection');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select is(public.get_player_profile('11111111-1111-4111-8111-111111111111')->>'trainerName','Private A Name','Owner starts with account display name before any showcase row');
select ok(public.get_player_profile('22222222-2222-4222-8222-222222222222')->>'trainerName' = 'Private B Name' and jsonb_array_length(public.search_players('Private B Name')) = 1,'Accounts without showcase rows are visible and searchable by display name');
select throws_ok($$select * from public.trainer_profiles$$,'42501',null,'Direct social table reads cannot bypass projection');
select lives_ok($$select public.manage_friend_connection('22222222-2222-4222-8222-222222222222','request')$$,'Friend requests work before either account creates a showcase');
select public.manage_friend_connection('22222222-2222-4222-8222-222222222222','cancel');
select throws_ok($$select public.update_player_showcase(true,'A','social-pikachu','[]',false)$$,'22023',null,'Explicit trainer names reject a one-character identity');
select throws_ok($$select public.update_player_showcase(true,'Social TAP Trainer A','missing-pokemon','[]',false)$$,'22023',null,'Favourite Pokemon must exist in catalogue');
select throws_ok($$select public.update_player_showcase(true,'Social TAP Trainer A',null,'[{"set":"SVI","number":"1","name":"Art","url":"https://example.com"}]',false)$$,'22023',null,'Card payloads reject arbitrary fields and URLs');
select throws_ok($$select public.update_player_showcase(true,'Social TAP Trainer A',null,'[{"set":"SVI","number":"1","name":"Art"},{"set":"SVI","number":"1","name":"Same Art"}]',false)$$,'22023',null,'Favourite card print identity cannot repeat');
select throws_ok($$select public.update_player_showcase(true,'Social TAP Trainer A',null,'[{"set":"SVI","number":"1","name":"A"},{"set":"SVI","number":"2","name":"B"},{"set":"SVI","number":"3","name":"C"},{"set":"SVI","number":"4","name":"D"}]',false)$$,'22023',null,'Showcase is limited to three card arts');
select public.update_player_showcase(true,'Social TAP Trainer A','social-pikachu','[{"set":"SVI","number":"1","name":"Synthetic Art"}]',false);
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select public.update_player_showcase(true,'Social TAP Trainer B',null,'[]',false);
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select is(jsonb_array_length(public.search_players('Social TAP Trainer')),1,'Search prefers chosen trainer names over display names');
select is(jsonb_array_length(public.search_players('social-b@')),0,'Search does not use email addresses');
select ok(not (public.get_player_profile('22222222-2222-4222-8222-222222222222') ?| array['email','firstName','lastName','ptcglUsername','role']),'Projection excludes private account fields');
select is(public.get_player_profile('22222222-2222-4222-8222-222222222222')->'stats','null'::jsonb,'Strangers cannot read Battle Log statistics');
select throws_ok($$select public.manage_friend_connection('11111111-1111-4111-8111-111111111111','request')$$,'22023',null,'Users cannot request themselves');
select public.manage_friend_connection('22222222-2222-4222-8222-222222222222','request');
select public.manage_friend_connection('22222222-2222-4222-8222-222222222222','request');
select is(jsonb_array_length(public.get_friend_connections()->'outgoing'),1,'Repeated outgoing request remains a single relationship');
select throws_ok($$select public.manage_friend_connection('22222222-2222-4222-8222-222222222222','accept')$$,'42501',null,'Requester cannot accept their own invitation');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select is(jsonb_array_length(public.get_friend_connections()->'incoming'),1,'Recipient sees incoming request');
select throws_ok($$select public.manage_friend_connection('11111111-1111-4111-8111-111111111111','cancel')$$,'42501',null,'Recipient cannot impersonate requester cancellation');
select public.manage_friend_connection('11111111-1111-4111-8111-111111111111','accept');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select is(public.get_player_profile('22222222-2222-4222-8222-222222222222')->'stats','{"wins":1,"losses":1,"draws":0,"total":2}'::jsonb,'Accepted friend sees maintained Battle Log totals');
select is(public.get_player_profile('22222222-2222-4222-8222-222222222222')->'lastLoginAt','null'::jsonb,'Last login stays hidden by default even from friends');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select public.update_player_showcase(true,'Social TAP Trainer B',null,'[]',true);
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select is((public.get_player_profile('22222222-2222-4222-8222-222222222222')->>'lastLoginAt')::timestamptz,'2026-10-01T12:00:00Z'::timestamptz,'Last login appears only after separate sharing opt-in');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select public.update_player_showcase(false,'Social TAP Trainer B',null,'[]',true);
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select is(public.get_player_profile('22222222-2222-4222-8222-222222222222')->>'enabled','true','Legacy disable writes cannot hide a player profile');
select is(public.get_friend_connections()->'friends'->0->>'trainerName','Social TAP Trainer B','Legacy disable writes preserve accepted-friend identity');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select public.update_player_showcase(true,'Social TAP Trainer B',null,'[]',true);
select public.manage_friend_connection('11111111-1111-4111-8111-111111111111','block');
select is(jsonb_array_length(public.get_friend_connections()->'friends'),0,'Blocking removes accepted friendship');
select is(jsonb_array_length(public.get_friend_connections()->'blocked'),1,'Blocker can manage their block');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select is(public.get_player_profile('22222222-2222-4222-8222-222222222222'),null::jsonb,'Blocked users cannot view blocking profile');
select is(jsonb_array_length(public.search_players('Social TAP Trainer B')),0,'Block hides profile from directory');
select throws_ok($$select public.manage_friend_connection('22222222-2222-4222-8222-222222222222','request')$$,'42501',null,'Block rejects renewed friend requests');
select public.manage_friend_connection('22222222-2222-4222-8222-222222222222','unblock');
select is(public.get_player_profile('22222222-2222-4222-8222-222222222222'),null::jsonb,'Blocked user cannot remove someone else block');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select public.manage_friend_connection('11111111-1111-4111-8111-111111111111','unblock');
select is(public.get_player_profile('11111111-1111-4111-8111-111111111111')->>'relationship','none','Unblocking does not recreate friendship');
select public.manage_friend_connection('11111111-1111-4111-8111-111111111111','request');
select public.manage_friend_connection('11111111-1111-4111-8111-111111111111','cancel');
select is(jsonb_array_length(public.get_friend_connections()->'outgoing'),0,'Requester can cancel pending request');
select public.manage_friend_connection('11111111-1111-4111-8111-111111111111','request');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select public.manage_friend_connection('22222222-2222-4222-8222-222222222222','decline');
select is(jsonb_array_length(public.get_friend_connections()->'incoming'),0,'Recipient can decline pending request');
select public.manage_friend_connection('22222222-2222-4222-8222-222222222222','request');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select public.manage_friend_connection('11111111-1111-4111-8111-111111111111','accept');
select public.manage_friend_connection('11111111-1111-4111-8111-111111111111','remove');
select is(public.get_player_profile('11111111-1111-4111-8111-111111111111')->'stats','null'::jsonb,'Removing friendship immediately revokes shared statistics');
select is((select count(*) from public.profiles where id='11111111-1111-4111-8111-111111111111'),0::bigint,'Social feature preserves private profile row isolation');

-- Avatar storage rules run under real authenticated roles and synthetic identities.
insert into storage.objects(bucket_id,name,owner_id) values (
 'profile-avatars','22222222-2222-4222-8222-222222222222/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp','22222222-2222-4222-8222-222222222222');
update public.profiles set avatar_path='22222222-2222-4222-8222-222222222222/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'
where id='22222222-2222-4222-8222-222222222222';
select is(public.get_player_profile('22222222-2222-4222-8222-222222222222')->>'avatarPath',
 '22222222-2222-4222-8222-222222222222/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp','Owner upload path reaches curated player projection');
select throws_ok($$insert into storage.objects(bucket_id,name,owner_id) values (
 'profile-avatars','11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp','22222222-2222-4222-8222-222222222222')$$,
 '42501',null,'Cross-account upload path is rejected by storage RLS');
select throws_ok($$update public.profiles set avatar_path='11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'
 where id='22222222-2222-4222-8222-222222222222'$$,'23514',null,'A player cannot attach another owner avatar path');
with changed as (update storage.objects set name='22222222-2222-4222-8222-222222222222/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp'
 where bucket_id='profile-avatars' returning id)
select is((select count(*) from changed),0::bigint,'Published avatar objects cannot be overwritten or renamed');
set local role anon;
select throws_ok($$insert into storage.objects(bucket_id,name,owner_id) values (
 'profile-avatars','22222222-2222-4222-8222-222222222222/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp','22222222-2222-4222-8222-222222222222')$$,
 '42501',null,'Anonymous callers cannot upload profile images');
set local role authenticated;

-- Raise on any failed TAP assertion so the same file is also safe for migration rehearsal.
do $$ declare summary text; begin
  for summary in select * from extensions.finish() loop
    if summary like '#%' then raise exception '%', summary; end if;
  end loop;
end $$;
rollback;
