-- Opt-in member profiles. Private account profiles retain their existing RLS.
create or replace function private.valid_favourite_cards(p_cards jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if p_cards is null or jsonb_typeof(p_cards) <> 'array' then return false; end if;
  if jsonb_array_length(p_cards) > 3 then return false; end if;
  if exists (
    select 1 from jsonb_array_elements(p_cards) card
    where jsonb_typeof(card) <> 'object'
      or jsonb_typeof(card -> 'set') is distinct from 'string'
      or jsonb_typeof(card -> 'number') is distinct from 'string'
      or jsonb_typeof(card -> 'name') is distinct from 'string'
      or (card ->> 'set') !~ '^[A-Z0-9-]{1,12}$'
      or (card ->> 'number') !~ '^[A-Z]*[0-9]+[A-Z]*$'
      or length(card ->> 'number') > 12
      or (card ->> 'number') ~ '(^|[A-Z])0+[0-9]'
      or length(btrim(card ->> 'name')) not between 1 and 120
      or (card ->> 'name') ~ '[[:cntrl:]]'
      or (card - 'set' - 'number' - 'name') <> '{}'::jsonb
  ) then return false; end if;
  return (select count(*) = count(distinct lower(card ->> 'set') || ':' || lower(card ->> 'number'))
    from jsonb_array_elements(p_cards) card);
end;
$$;
revoke all on function private.valid_favourite_cards(jsonb) from public, anon, authenticated;
grant execute on function private.valid_favourite_cards(jsonb) to service_role;

create table public.trainer_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  trainer_name text not null default '' check (length(trainer_name) <= 40 and trainer_name !~ '[[:cntrl:]]'),
  favourite_pokemon text references public.pokemon_catalog(slug) on delete set null,
  favourite_cards jsonb not null default '[]' check (private.valid_favourite_cards(favourite_cards)),
  share_last_login boolean not null default false,
  updated_at timestamptz not null default now(),
  check (not enabled or length(btrim(trainer_name)) between 2 and 40)
);
create index trainer_profiles_directory on public.trainer_profiles (lower(trainer_name), user_id) where enabled;

create table public.friend_connections (
  user_low uuid not null references public.profiles(id) on delete cascade,
  user_high uuid not null references public.profiles(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (user_low, user_high),
  check (user_low < user_high),
  check (requester_id in (user_low, user_high))
);
create index friend_connections_high on public.friend_connections (user_high);
create table public.player_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index player_blocks_target on public.player_blocks (blocked_id, blocker_id);

alter table public.trainer_profiles enable row level security;
alter table public.friend_connections enable row level security;
alter table public.player_blocks enable row level security;
revoke all on public.trainer_profiles, public.friend_connections, public.player_blocks from public, anon, authenticated;
grant all on public.trainer_profiles, public.friend_connections, public.player_blocks to service_role;

create or replace function public.get_player_profile(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_profile public.trainer_profiles;
  v_relation text := 'none';
  v_connection public.friend_connections;
  v_stats jsonb := null;
  v_avatar text;
  v_last_login timestamptz;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  select * into v_profile from public.trainer_profiles where user_id = p_user_id;
  if v_actor <> p_user_id and (
    not coalesce(v_profile.enabled, false) or exists (
      select 1 from public.player_blocks where
        (blocker_id = v_actor and blocked_id = p_user_id) or (blocker_id = p_user_id and blocked_id = v_actor)
    )
  ) then return null; end if;
  select avatar_color, last_login_at into v_avatar, v_last_login from public.profiles where id = p_user_id;
  if not found then return null; end if;
  if v_actor = p_user_id then v_relation := 'self';
  else
    select * into v_connection from public.friend_connections
      where user_low = least(v_actor, p_user_id) and user_high = greatest(v_actor, p_user_id);
    if found then
      v_relation := case when v_connection.status = 'accepted' then 'friends'
        when v_connection.requester_id = v_actor then 'outgoing' else 'incoming' end;
    end if;
  end if;
  if v_relation in ('self', 'friends') then
    select jsonb_build_object('wins', coalesce(s.games_won, 0), 'losses', coalesce(s.games_lost, 0),
      'draws', 0, 'total', coalesce(s.games_played, 0)) into v_stats
      from (select 1) placeholder left join public.user_log_stats s on s.user_id = p_user_id;
  end if;
  return jsonb_build_object(
    'id', p_user_id, 'trainerName', coalesce(v_profile.trainer_name, ''), 'avatarColor', v_avatar,
    'enabled', coalesce(v_profile.enabled, false), 'favouritePokemon', v_profile.favourite_pokemon,
    'favouriteCards', coalesce(v_profile.favourite_cards, '[]'::jsonb),
    'shareLastLogin', v_actor = p_user_id and coalesce(v_profile.share_last_login, false),
    'stats', v_stats, 'lastLoginAt', case when v_actor = p_user_id or
      (v_relation = 'friends' and v_profile.share_last_login) then v_last_login else null end,
    'relationship', v_relation
  );
end;
$$;

create or replace function public.search_players(p_query text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_query text := lower(btrim(coalesce(p_query, ''))); v_result jsonb;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  if length(v_query) not between 2 and 80 then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(public.get_player_profile(matches.user_id) order by matches.name, matches.user_id), '[]'::jsonb)
    into v_result from (
      select t.user_id, lower(t.trainer_name) name from public.trainer_profiles t
      where t.enabled and t.user_id <> v_actor and strpos(lower(t.trainer_name), v_query) > 0
        and not exists (select 1 from public.player_blocks b where
          (b.blocker_id = v_actor and b.blocked_id = t.user_id) or (b.blocker_id = t.user_id and b.blocked_id = v_actor))
      order by lower(t.trainer_name), t.user_id limit 20
    ) matches;
  return v_result;
end;
$$;

create or replace function public.get_friend_connections()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid(); v_row record; v_profile jsonb; v_relation text;
  v_result jsonb := '{"friends":[],"incoming":[],"outgoing":[],"blocked":[]}'::jsonb;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  for v_row in
    select case when user_low = v_actor then user_high else user_low end target,
      case when status = 'accepted' then 'friends' when requester_id = v_actor then 'outgoing' else 'incoming' end relation
      from public.friend_connections where v_actor in (user_low, user_high)
    union all select blocked_id, 'blocked' from public.player_blocks where blocker_id = v_actor
  loop
    v_relation := v_row.relation;
    v_profile := public.get_player_profile(v_row.target);
    if v_profile is null then
      v_profile := jsonb_build_object('id', v_row.target, 'trainerName', 'Trainer', 'avatarColor', 'red',
        'enabled', false, 'favouritePokemon', null, 'favouriteCards', '[]'::jsonb,
        'shareLastLogin', false, 'stats', null, 'lastLoginAt', null, 'relationship', v_relation);
    end if;
    v_result := jsonb_set(v_result, array[v_relation], (v_result -> v_relation) || jsonb_build_array(v_profile));
  end loop;
  return v_result;
end;
$$;

create or replace function public.update_player_showcase(
  p_enabled boolean, p_trainer_name text, p_favourite_pokemon text,
  p_favourite_cards jsonb, p_share_last_login boolean
)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_name text := btrim(coalesce(p_trainer_name, ''));
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  if p_enabled is null or p_share_last_login is null or length(v_name) > 40
    or v_name ~ '[[:cntrl:]]' or (p_enabled and length(v_name) < 2) or not private.valid_favourite_cards(p_favourite_cards) then
    raise exception using errcode = '22023', message = 'Choose a trainer name and up to three distinct favourite cards.';
  end if;
  if nullif(p_favourite_pokemon, '') is not null and not exists (
    select 1 from public.pokemon_catalog where slug = p_favourite_pokemon
  ) then raise exception using errcode = '22023', message = 'Choose a Pokemon from the catalogue.'; end if;
  insert into public.trainer_profiles(user_id, enabled, trainer_name, favourite_pokemon, favourite_cards, share_last_login)
    values(v_actor, p_enabled, v_name, nullif(p_favourite_pokemon, ''), p_favourite_cards, p_share_last_login)
    on conflict(user_id) do update set enabled = excluded.enabled, trainer_name = excluded.trainer_name,
      favourite_pokemon = excluded.favourite_pokemon, favourite_cards = excluded.favourite_cards,
      share_last_login = excluded.share_last_login, updated_at = statement_timestamp();
end;
$$;

create or replace function public.manage_friend_connection(p_target_user_id uuid, p_action text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid(); v_low uuid; v_high uuid; v_connection public.friend_connections;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  if p_target_user_id is null or p_target_user_id = v_actor then
    raise exception using errcode = '22023', message = 'Choose another trainer.';
  end if;
  if p_action is null or p_action not in ('request','accept','decline','cancel','remove','block','unblock') then
    raise exception using errcode = '22023', message = 'Unknown friend action.';
  end if;
  v_low := least(v_actor, p_target_user_id); v_high := greatest(v_actor, p_target_user_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('friends:' || v_low::text || ':' || v_high::text, 0));
  if p_action = 'unblock' then
    delete from public.player_blocks where blocker_id = v_actor and blocked_id = p_target_user_id; return;
  end if;
  if p_action = 'block' then
    if not exists (select 1 from public.profiles where id = p_target_user_id) then
      raise exception using errcode = '22023', message = 'Trainer unavailable.';
    end if;
    insert into public.player_blocks(blocker_id, blocked_id) values(v_actor, p_target_user_id) on conflict do nothing;
    delete from public.friend_connections where user_low = v_low and user_high = v_high; return;
  end if;
  select * into v_connection from public.friend_connections where user_low = v_low and user_high = v_high;
  if p_action in ('request','accept') then
    perform 1 from public.trainer_profiles where user_id in (v_actor, p_target_user_id) order by user_id for update;
    if (select count(*) from public.trainer_profiles where user_id in (v_actor, p_target_user_id) and enabled) <> 2
      or exists (select 1 from public.player_blocks where
        (blocker_id = v_actor and blocked_id = p_target_user_id) or (blocker_id = p_target_user_id and blocked_id = v_actor)) then
      raise exception using errcode = '42501', message = 'Both trainers must have an available player profile.';
    end if;
  end if;
  if p_action = 'request' then
    if v_connection.status = 'accepted' or v_connection.requester_id = v_actor then return; end if;
    if v_connection.requester_id is not null then
      raise exception using errcode = '22023', message = 'Accept or decline the existing friend request.';
    end if;
    insert into public.friend_connections(user_low, user_high, requester_id, status) values(v_low, v_high, v_actor, 'pending');
  elsif p_action = 'accept' then
    if v_connection.status = 'accepted' then return; end if;
    if v_connection.status is distinct from 'pending' or v_connection.requester_id = v_actor then
      raise exception using errcode = '42501', message = 'Only the recipient can accept a friend request.';
    end if;
    update public.friend_connections set status = 'accepted' where user_low = v_low and user_high = v_high;
  elsif p_action in ('cancel','decline') then
    if v_connection.status is null then return; end if;
    if v_connection.status <> 'pending' or (p_action = 'cancel') <> (v_connection.requester_id = v_actor) then
      raise exception using errcode = '42501', message = 'This friend request action is unavailable.';
    end if;
    delete from public.friend_connections where user_low = v_low and user_high = v_high;
  elsif p_action = 'remove' then
    if v_connection.status is null then return; end if;
    if v_connection.status <> 'accepted' then raise exception using errcode = '22023', message = 'This trainer is not a friend.'; end if;
    delete from public.friend_connections where user_low = v_low and user_high = v_high;
  end if;
end;
$$;

revoke all on function public.get_player_profile(uuid), public.search_players(text), public.get_friend_connections(),
  public.update_player_showcase(boolean,text,text,jsonb,boolean), public.manage_friend_connection(uuid,text) from public, anon, authenticated;
grant execute on function public.get_player_profile(uuid), public.search_players(text), public.get_friend_connections(),
  public.update_player_showcase(boolean,text,text,jsonb,boolean), public.manage_friend_connection(uuid,text) to authenticated;
notify pgrst, 'reload schema';
