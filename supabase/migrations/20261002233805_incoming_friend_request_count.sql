-- A small member-only projection for the Friends notification indicator.
create or replace function public.get_incoming_friend_request_count()
returns integer language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_count integer;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  select count(*)::integer into v_count
  from public.friend_connections
  where status = 'pending' and requester_id <> v_actor
    and v_actor in (user_low, user_high);
  return v_count;
end;
$$;
revoke all on function public.get_incoming_friend_request_count() from public, anon, authenticated;
grant execute on function public.get_incoming_friend_request_count() to authenticated;
notify pgrst, 'reload schema';
