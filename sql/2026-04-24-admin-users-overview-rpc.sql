-- Aggregated admin users read model for the dashboard user table.
-- Keeps broad counting work inside Postgres and sends only render-ready rows.

create or replace function public.get_admin_users_overview()
returns table (
  id uuid,
  email text,
  display_name text,
  ptcgl_username text,
  role text,
  auth_account_created_at timestamptz,
  last_login_at timestamptz,
  last_active_at timestamptz,
  login_count integer,
  created_at timestamptz,
  deck_count integer,
  deck_list_count integer,
  tournament_count integer,
  log_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  with current_profile as (
    select role
    from public.profiles
    where id = auth.uid()
    limit 1
  ),
  deck_counts as (
    select
      user_id,
      count(*)::integer as deck_count,
      coalesce(
        sum(
          case
            when jsonb_typeof(deck_lists) = 'array' then jsonb_array_length(deck_lists)
            else 0
          end
        ),
        0
      )::integer as deck_list_count
    from public.decks
    group by user_id
  ),
  tournament_counts as (
    select user_id, count(*)::integer as tournament_count
    from public.tournaments
    group by user_id
  )
  select
    p.id,
    p.email,
    p.display_name,
    p.ptcgl_username,
    p.role,
    p.auth_account_created_at,
    p.last_login_at,
    p.last_active_at,
    p.login_count,
    p.created_at,
    coalesce(dc.deck_count, 0) as deck_count,
    coalesce(dc.deck_list_count, 0) as deck_list_count,
    coalesce(tc.tournament_count, 0) as tournament_count,
    coalesce(uls.games_played, 0)::integer as log_count
  from public.profiles p
  left join deck_counts dc on dc.user_id = p.id
  left join tournament_counts tc on tc.user_id = p.id
  left join public.user_log_stats uls on uls.user_id = p.id
  where exists (select 1 from current_profile where role = 'admin')
  order by
    case when p.role = 'admin' then 0 else 1 end,
    coalesce(p.last_active_at, p.last_login_at, p.auth_account_created_at, p.created_at) desc;
$$;

revoke all on function public.get_admin_users_overview() from public;
grant execute on function public.get_admin_users_overview() to authenticated;

notify pgrst, 'reload schema';
