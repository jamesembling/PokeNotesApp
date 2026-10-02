-- Keep the legacy enabled column and RPC argument for rolling app deployments.
-- Discovery no longer depends on an opt-in row or accepts old hide writes.
alter table public.trainer_profiles drop constraint trainer_profiles_check;
alter table public.trainer_profiles alter column enabled set default true;

alter table public.profiles add column avatar_path text;
alter table public.profiles add constraint profiles_avatar_path_owned check (
  avatar_path is null or avatar_path ~ ('^' || id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$')
);
grant update (avatar_path) on public.profiles to authenticated;

-- Only immutable, owner-scoped object names. Replacements use a new UUID.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('profile-avatars', 'profile-avatars', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
create policy profile_avatar_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'profile-avatars' and owner_id = (select auth.uid())::text
  and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$')
);
create policy profile_avatar_select on storage.objects for select to authenticated using (
  bucket_id = 'profile-avatars' and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy profile_avatar_delete on storage.objects for delete to authenticated using (
  bucket_id = 'profile-avatars' and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create or replace function public.get_player_profile(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_profile public.trainer_profiles;
  v_relation text := 'none';
  v_connection public.friend_connections;
  v_stats jsonb := null;
  v_avatar text;
  v_avatar_path text;
  v_display_name text;
  v_last_login timestamptz;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  select * into v_profile from public.trainer_profiles where user_id = p_user_id;
  if v_actor <> p_user_id and (
    exists (
      select 1 from public.player_blocks where
        (blocker_id = v_actor and blocked_id = p_user_id) or (blocker_id = p_user_id and blocked_id = v_actor)
    )
  ) then return null; end if;
  select avatar_color, avatar_path, display_name, last_login_at into v_avatar, v_avatar_path, v_display_name, v_last_login from public.profiles where id = p_user_id;
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
    'id', p_user_id, 'trainerName', coalesce(nullif(btrim(v_profile.trainer_name), ''), case when length(btrim(v_display_name)) >= 2 then left(btrim(v_display_name), 40) end, 'Player ' || left(p_user_id::text, 8)), 'avatarColor', v_avatar, 'avatarPath', v_avatar_path,
    'enabled', true, 'favouritePokemon', v_profile.favourite_pokemon,
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
      select p.id user_id, lower(coalesce(nullif(btrim(t.trainer_name), ''), case when length(btrim(p.display_name)) >= 2 then left(btrim(p.display_name), 40) end, 'Player ' || left(p.id::text, 8))) name
      from public.profiles p left join public.trainer_profiles t on t.user_id = p.id
      where p.id <> v_actor
        and strpos(lower(coalesce(nullif(btrim(t.trainer_name), ''), case when length(btrim(p.display_name)) >= 2 then left(btrim(p.display_name), 40) end, 'Player ' || left(p.id::text, 8))), v_query) > 0
        and not exists (select 1 from public.player_blocks b where
          (b.blocker_id = v_actor and b.blocked_id = p.id) or (b.blocker_id = p.id and b.blocked_id = v_actor))
      order by name, p.id limit 20
    ) matches;
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
    or v_name ~ '[[:cntrl:]]' or (length(v_name) = 1) or not private.valid_favourite_cards(p_favourite_cards) then
    raise exception using errcode = '22023', message = 'Choose a trainer name and up to three distinct favourite cards.';
  end if;
  if nullif(p_favourite_pokemon, '') is not null and not exists (
    select 1 from public.pokemon_catalog where slug = p_favourite_pokemon
  ) then raise exception using errcode = '22023', message = 'Choose a Pokemon from the catalogue.'; end if;
  insert into public.trainer_profiles(user_id, enabled, trainer_name, favourite_pokemon, favourite_cards, share_last_login)
    values(v_actor, true, v_name, nullif(p_favourite_pokemon, ''), p_favourite_cards, p_share_last_login)
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
    perform 1 from public.profiles where id in (v_actor, p_target_user_id) order by id for update;
    if (select count(*) from public.profiles where id in (v_actor, p_target_user_id)) <> 2
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


notify pgrst, 'reload schema';
