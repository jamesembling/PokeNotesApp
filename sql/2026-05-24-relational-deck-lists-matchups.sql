create table if not exists public.deck_lists (
  id text primary key,
  deck_id text not null references public.decks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  format text not null default '',
  date text not null default '',
  created_by text not null default '',
  notes text not null default '',
  raw_list text not null default '',
  parsed_cards jsonb not null default '[]',
  sorted_cards jsonb not null default '[]',
  sorted_cards_version integer,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint deck_lists_user_deck_id_unique
    unique (user_id, deck_id, id)
);

comment on table public.deck_lists is
  'Relational deck-list rows. Kept in compatibility with public.decks.deck_lists during migration.';
comment on column public.deck_lists.position is
  'Display order migrated from the previous decks.deck_lists JSON array order.';

create table if not exists public.deck_matchups (
  id text primary key,
  deck_id text not null references public.decks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_name text not null default '',
  deck_pokemon jsonb not null default '[]',
  format text not null default '',
  go_preference text not null default ''
    check (go_preference in ('First', 'Second', '')),
  matchup_favor text not null default '',
  ideal_bench text not null default '',
  techs_needed text not null default '',
  matchup_plan text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint deck_matchups_user_deck_id_unique
    unique (user_id, deck_id, id)
);

comment on table public.deck_matchups is
  'Relational deck matchup-note rows. Kept in compatibility with public.decks.matchups during migration.';

create index if not exists deck_lists_user_deck_position
  on public.deck_lists (user_id, deck_id, position, created_at desc);
create index if not exists deck_lists_user_deck_updated
  on public.deck_lists (user_id, deck_id, updated_at desc);
create index if not exists deck_matchups_user_deck_position
  on public.deck_matchups (user_id, deck_id, position, created_at asc);
create index if not exists deck_matchups_user_deck_updated
  on public.deck_matchups (user_id, deck_id, updated_at desc);

alter table public.deck_lists enable row level security;
alter table public.deck_matchups enable row level security;

drop policy if exists "Users can read own deck lists" on public.deck_lists;
create policy "Users can read own deck lists"
  on public.deck_lists for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own deck lists" on public.deck_lists;
create policy "Users can insert own deck lists"
  on public.deck_lists for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own deck lists" on public.deck_lists;
create policy "Users can update own deck lists"
  on public.deck_lists for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own deck lists" on public.deck_lists;
create policy "Users can delete own deck lists"
  on public.deck_lists for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read own deck matchups" on public.deck_matchups;
create policy "Users can read own deck matchups"
  on public.deck_matchups for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own deck matchups" on public.deck_matchups;
create policy "Users can insert own deck matchups"
  on public.deck_matchups for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own deck matchups" on public.deck_matchups;
create policy "Users can update own deck matchups"
  on public.deck_matchups for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own deck matchups" on public.deck_matchups;
create policy "Users can delete own deck matchups"
  on public.deck_matchups for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.deck_lists to authenticated;
grant select, insert, update, delete on table public.deck_matchups to authenticated;
grant all privileges on table public.deck_lists to service_role;
grant all privileges on table public.deck_matchups to service_role;

drop trigger if exists set_deck_lists_updated_at on public.deck_lists;
create trigger set_deck_lists_updated_at
  before update on public.deck_lists
  for each row execute function set_updated_at();

drop trigger if exists set_deck_matchups_updated_at on public.deck_matchups;
create trigger set_deck_matchups_updated_at
  before update on public.deck_matchups
  for each row execute function set_updated_at();

with deck_list_source as (
  select
    coalesce(nullif(item.value->>'id', ''), gen_random_uuid()::text) as id,
    d.id as deck_id,
    d.user_id,
    coalesce(item.value->>'name', '') as name,
    coalesce(item.value->>'format', '') as format,
    coalesce(item.value->>'date', '') as date,
    coalesce(item.value->>'createdBy', item.value->>'created_by', '') as created_by,
    coalesce(item.value->>'notes', '') as notes,
    coalesce(item.value->>'rawList', item.value->>'raw_list', '') as raw_list,
    coalesce(item.value->'parsedCards', item.value->'parsed_cards', '[]'::jsonb) as parsed_cards,
    coalesce(item.value->'sortedCards', item.value->'sorted_cards', '[]'::jsonb) as sorted_cards,
    nullif(coalesce(item.value->>'sortedCardsVersion', item.value->>'sorted_cards_version', ''), '')::integer as sorted_cards_version,
    item.ordinality::integer - 1 as position,
    coalesce(nullif(coalesce(item.value->>'createdAt', item.value->>'created_at', ''), '')::timestamptz, d.created_at) as created_at,
    coalesce(nullif(coalesce(item.value->>'updatedAt', item.value->>'updated_at', ''), '')::timestamptz, d.updated_at) as updated_at
  from public.decks d
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(d.deck_lists) = 'array' then d.deck_lists else '[]'::jsonb end
  ) with ordinality as item(value, ordinality)
  where coalesce(item.value->>'id', '') <> ''
),
deduped_deck_lists as (
  select *
  from (
    select
      deck_list_source.*,
      row_number() over (partition by id order by updated_at desc, deck_id) as duplicate_rank
    from deck_list_source
  ) ranked
  where duplicate_rank = 1
)
insert into public.deck_lists (
  id,
  deck_id,
  user_id,
  name,
  format,
  date,
  created_by,
  notes,
  raw_list,
  parsed_cards,
  sorted_cards,
  sorted_cards_version,
  position,
  created_at,
  updated_at
)
select
  id,
  deck_id,
  user_id,
  name,
  format,
  date,
  created_by,
  notes,
  raw_list,
  parsed_cards,
  sorted_cards,
  sorted_cards_version,
  position,
  created_at,
  updated_at
from deduped_deck_lists
on conflict (id) do update
set
  deck_id = excluded.deck_id,
  user_id = excluded.user_id,
  name = excluded.name,
  format = excluded.format,
  date = excluded.date,
  created_by = excluded.created_by,
  notes = excluded.notes,
  raw_list = excluded.raw_list,
  parsed_cards = excluded.parsed_cards,
  sorted_cards = excluded.sorted_cards,
  sorted_cards_version = excluded.sorted_cards_version,
  position = excluded.position,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;

with deck_matchup_source as (
  select
    coalesce(nullif(item.value->>'id', ''), gen_random_uuid()::text) as id,
    d.id as deck_id,
    d.user_id,
    coalesce(item.value->>'deckName', item.value->>'deck_name', '') as deck_name,
    coalesce(item.value->'deckPokemon', item.value->'deck_pokemon', '[]'::jsonb) as deck_pokemon,
    coalesce(item.value->>'format', '') as format,
    case
      when coalesce(item.value->>'goPreference', item.value->>'go_preference', '') in ('First', 'Second')
        then coalesce(item.value->>'goPreference', item.value->>'go_preference', '')
      else ''
    end as go_preference,
    coalesce(item.value->>'matchupFavor', item.value->>'matchup_favor', '') as matchup_favor,
    coalesce(item.value->>'idealBench', item.value->>'ideal_bench', '') as ideal_bench,
    coalesce(item.value->>'techsNeeded', item.value->>'techs_needed', '') as techs_needed,
    coalesce(item.value->>'matchupPlan', item.value->>'matchup_plan', '') as matchup_plan,
    item.ordinality::integer - 1 as position,
    coalesce(nullif(coalesce(item.value->>'createdAt', item.value->>'created_at', ''), '')::timestamptz, d.created_at) as created_at,
    coalesce(nullif(coalesce(item.value->>'updatedAt', item.value->>'updated_at', ''), '')::timestamptz, d.updated_at) as updated_at
  from public.decks d
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(d.matchups) = 'array' then d.matchups else '[]'::jsonb end
  ) with ordinality as item(value, ordinality)
  where coalesce(item.value->>'id', '') <> ''
),
deduped_deck_matchups as (
  select *
  from (
    select
      deck_matchup_source.*,
      row_number() over (partition by id order by updated_at desc, deck_id) as duplicate_rank
    from deck_matchup_source
  ) ranked
  where duplicate_rank = 1
)
insert into public.deck_matchups (
  id,
  deck_id,
  user_id,
  deck_name,
  deck_pokemon,
  format,
  go_preference,
  matchup_favor,
  ideal_bench,
  techs_needed,
  matchup_plan,
  position,
  created_at,
  updated_at
)
select
  id,
  deck_id,
  user_id,
  deck_name,
  deck_pokemon,
  format,
  go_preference,
  matchup_favor,
  ideal_bench,
  techs_needed,
  matchup_plan,
  position,
  created_at,
  updated_at
from deduped_deck_matchups
on conflict (id) do update
set
  deck_id = excluded.deck_id,
  user_id = excluded.user_id,
  deck_name = excluded.deck_name,
  deck_pokemon = excluded.deck_pokemon,
  format = excluded.format,
  go_preference = excluded.go_preference,
  matchup_favor = excluded.matchup_favor,
  ideal_bench = excluded.ideal_bench,
  techs_needed = excluded.techs_needed,
  matchup_plan = excluded.matchup_plan,
  position = excluded.position,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;

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
    greatest(
      (
        select count(*)::integer
        from public.deck_lists dl
        where dl.user_id = d.user_id
          and dl.deck_id = d.id
      ),
      case
        when jsonb_typeof(d.deck_lists) = 'array' then jsonb_array_length(d.deck_lists)
        else 0
      end
    ) as deck_list_count,
    d.created_at,
    d.updated_at
  from public.decks d
  where d.user_id = auth.uid()
  order by d.updated_at desc;
$$;

revoke all on function public.get_deck_index() from public;
grant execute on function public.get_deck_index() to authenticated;

notify pgrst, 'reload schema';
