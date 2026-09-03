alter table public.profiles
  add column ptcgl_username_aliases text[] not null default '{}';

alter table public.profiles
  add constraint profiles_ptcgl_username_aliases_count
    check (cardinality(ptcgl_username_aliases) <= 10),
  add constraint profiles_ptcgl_username_aliases_size
    check (octet_length(array_to_string(ptcgl_username_aliases, ',')) <= 650),
  add constraint profiles_ptcgl_username_aliases_no_nulls
    check (array_position(ptcgl_username_aliases, null) is null);

comment on column public.profiles.ptcgl_username_aliases is
  'Alternate account-owned Pokemon TCG Live usernames accepted for self-player identification.';

update public.profiles
set ptcgl_username_aliases = array_append(ptcgl_username_aliases, 'JJPokeMan2026')
where lower(btrim(ptcgl_username)) = 'jammeruk1993'
  and not exists (
    select 1
    from unnest(ptcgl_username_aliases) as existing_alias
    where lower(btrim(existing_alias)) = 'jjpokeman2026'
  );

grant update (ptcgl_username_aliases)
  on table public.profiles to authenticated;

notify pgrst, 'reload schema';
