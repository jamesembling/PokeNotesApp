alter table public.decks
  add column if not exists archetype_id text not null default '';

comment on column public.decks.archetype_id is
  'Backend-owned canonical deck archetype key derived from the selected Pokemon slugs.';

create index if not exists decks_user_archetype
  on public.decks (user_id, archetype_id)
  where archetype_id <> '';

update public.decks
set archetype_id = array_to_string(
  (
    select array_agg(value order by value)
    from (
      select distinct trim(lower(jsonb_array_elements_text(deck_pokemon))) as value
    ) normalized
    where value <> ''
  ),
  '+'
)
where archetype_id = '';
