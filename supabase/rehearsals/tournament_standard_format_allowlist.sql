-- Run against a disposable database after the latest Tournament format allowlist migration.
-- Verify the new default, the previous format, and the rejection boundary.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '88888888-8888-4888-8888-888888888888',
  'authenticated', 'authenticated', 'format-rehearsal@pokenotes.local', '',
  now(), '{}', '{}', now(), now()
);

set role authenticated;
select set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-888888888888', false);

do $verify$
declare
  v_result jsonb;
  v_updated_at timestamptz;
  v_invalid_rejected boolean := false;
begin
  v_result := public.commit_tournament_metadata(
    'create', 'format-rehearsal-dlr', 'format-rehearsal-dlr',
    jsonb_build_object(
      'name', 'Delta Reign', 'date_from', current_date::text,
      'date_to', current_date::text, 'format', 'TEF-DLR'
    )
  );
  if v_result ->> 'status' <> 'committed'
    or (select format from public.tournaments where id = 'format-rehearsal-dlr') <> 'TEF-DLR'
  then
    raise exception 'TEF-DLR Tournament create did not commit';
  end if;

  select updated_at into strict v_updated_at
  from public.tournaments where id = 'format-rehearsal-dlr';
  v_result := public.commit_tournament_metadata(
    'update', 'format-rehearsal-dlr', 'format-rehearsal-30c-update',
    jsonb_build_object(
      'name', '30th Celebration', 'date_from', current_date::text,
      'date_to', current_date::text, 'format', 'TEF-30C'
    ),
    v_updated_at
  );
  if v_result ->> 'status' <> 'committed'
    or (select format from public.tournaments where id = 'format-rehearsal-dlr') <> 'TEF-30C'
  then
    raise exception 'existing TEF-30C Tournament update regressed';
  end if;

  begin
    perform public.commit_tournament_metadata(
      'create', 'format-rehearsal-invalid', 'format-rehearsal-invalid',
      jsonb_build_object(
        'name', 'Invalid format', 'date_from', current_date::text,
        'date_to', current_date::text, 'format', 'ZZZ-ZZZ'
      )
    );
  exception when sqlstate '22023' then
    v_invalid_rejected := true;
  end;
  if not v_invalid_rejected
    or exists (select 1 from public.tournaments where id = 'format-rehearsal-invalid')
  then
    raise exception 'unknown Tournament format was accepted';
  end if;
end;
$verify$;

reset role;
