-- Apply the real migration to the pre-change schema, then check account isolation.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '88888888-8888-4888-8888-888888888888', 'authenticated', 'authenticated', 'events-owner@pokenotes.local', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999999999', 'authenticated', 'authenticated', 'events-other@pokenotes.local', '', now(), '{}', '{}', now(), now());

insert into public.limitless_event_feed (feed_key, events)
values ('ptcg-standard-ptcgl', '[]'::jsonb);

set role authenticated;
select set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-888888888888', false);

insert into public.user_event_preferences (user_id, search_query, starts_after)
values ('88888888-8888-4888-8888-888888888888', 'Weekly', '19:00');
insert into public.user_event_pins (user_id, event_id, event_snapshot)
values ('88888888-8888-4888-8888-888888888888', 'aaaaaaaaaaaaaaaaaaaaaaaa', '{"id":"aaaaaaaaaaaaaaaaaaaaaaaa"}'::jsonb);

do $verify$
begin
  if (select count(*) from public.limitless_event_feed) <> 1
    or (select search_query from public.user_event_preferences) <> 'Weekly'
    or (select count(*) from public.user_event_pins) <> 1 then
    raise exception 'owner cannot read event state';
  end if;
  begin
    insert into public.user_event_preferences (user_id)
    values ('99999999-9999-4999-8999-999999999999');
    raise exception 'cross-account preference insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.user_event_pins (user_id, event_id, event_snapshot)
    values ('99999999-9999-4999-8999-999999999999', 'bbbbbbbbbbbbbbbbbbbbbbbb', '{}'::jsonb);
    raise exception 'cross-account pin insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$verify$;

select set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', false);
do $verify$
begin
  if (select count(*) from public.user_event_preferences) <> 0
    or (select count(*) from public.user_event_pins) <> 0 then
    raise exception 'other account can read owner event state';
  end if;
end;
$verify$;
reset role;
