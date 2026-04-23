-- Grouped deck record read model for the /decks route.
-- Avoids returning every linked log row just to count records per deck.

create or replace function public.get_deck_index_stats(target_deck_ids text[])
returns table (
  deck_id text,
  total bigint,
  wins bigint,
  losses bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    l.linked_deck_id as deck_id,
    count(*)::bigint as total,
    count(*) filter (where l.result = 'Win')::bigint as wins,
    count(*) filter (where l.result = 'Loss')::bigint as losses
  from public.logs l
  where l.user_id = auth.uid()
    and l.linked_deck_id = any(target_deck_ids)
  group by l.linked_deck_id;
$$;

revoke all on function public.get_deck_index_stats(text[]) from public;
grant execute on function public.get_deck_index_stats(text[]) to authenticated;

notify pgrst, 'reload schema';
