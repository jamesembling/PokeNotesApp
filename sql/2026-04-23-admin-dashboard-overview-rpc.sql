create or replace function public.get_admin_dashboard_overview()
returns table (
  user_count bigint,
  admin_count bigint,
  pokemon_catalog_count bigint,
  archetype_catalog_count bigint,
  excluded_archetype_count bigint,
  pokemon_last_synced_at timestamptz,
  archetype_last_synced_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  select
    (select count(*) from public.profiles)::bigint as user_count,
    (select count(*) from public.profiles where role = 'admin')::bigint as admin_count,
    (select count(*) from public.pokemon_catalog)::bigint as pokemon_catalog_count,
    (select count(*) from public.archetype_catalog)::bigint as archetype_catalog_count,
    (select count(*) from public.archetype_catalog where is_excluded = true)::bigint as excluded_archetype_count,
    (select max(last_synced_at) from public.pokemon_catalog) as pokemon_last_synced_at,
    (select max(last_synced_at) from public.archetype_catalog) as archetype_last_synced_at;
end;
$$;

revoke all on function public.get_admin_dashboard_overview() from public;
grant execute on function public.get_admin_dashboard_overview() to authenticated;
