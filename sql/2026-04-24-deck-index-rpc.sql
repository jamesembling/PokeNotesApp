-- Narrow deck index read model for the /decks route.
-- Avoids sending full deck_lists JSON when the page only needs counts and identity fields.

create or replace function public.get_deck_index()
returns table (
  id text,
  user_id uuid,
  deck_name text,
  archetype_id text,
  format text,
  go_preference text,
  deck_pokemon jsonb,
  deck_list_count integer,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    d.id,
    d.user_id,
    d.deck_name,
    d.archetype_id,
    d.format,
    d.go_preference,
    d.deck_pokemon,
    case
      when jsonb_typeof(d.deck_lists) = 'array' then jsonb_array_length(d.deck_lists)
      else 0
    end as deck_list_count,
    d.created_at,
    d.updated_at
  from public.decks d
  where d.user_id = auth.uid()
  order by d.updated_at desc;
$$;

revoke all on function public.get_deck_index() from public;
grant execute on function public.get_deck_index() to authenticated;

notify pgrst, 'reload schema';
