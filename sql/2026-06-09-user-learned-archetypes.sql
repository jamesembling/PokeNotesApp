alter table public.archetype_catalog
  add column if not exists canonical_id text,
  add column if not exists source text not null default 'curated',
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists learned_match_count integer not null default 0;

update public.archetype_catalog
set source = 'curated'
where source is null;

alter table public.archetype_catalog
  drop constraint if exists archetype_catalog_source_check;

alter table public.archetype_catalog
  add constraint archetype_catalog_source_check
  check (source in ('curated', 'learned'));

alter table public.archetype_catalog
  drop constraint if exists archetype_catalog_learned_owner_check;

alter table public.archetype_catalog
  add constraint archetype_catalog_learned_owner_check
  check (
    (source = 'curated' and user_id is null)
    or (source = 'learned' and user_id is not null and canonical_id is not null)
  );

alter table public.archetype_catalog
  drop constraint if exists archetype_catalog_learned_match_count_check;

alter table public.archetype_catalog
  add constraint archetype_catalog_learned_match_count_check
  check (learned_match_count >= 0);

create index if not exists archetype_catalog_user_learned
  on public.archetype_catalog (user_id, canonical_id)
  where source = 'learned';

drop policy if exists "Anyone can read archetype catalog" on public.archetype_catalog;

create policy "Read public and own archetype catalog rows"
  on public.archetype_catalog for select
  using (source = 'curated' or auth.uid() = user_id);

create policy "Users can create learned archetype catalog rows"
  on public.archetype_catalog for insert
  with check (source = 'learned' and auth.uid() = user_id);

create policy "Users can update learned archetype catalog rows"
  on public.archetype_catalog for update
  using (source = 'learned' and auth.uid() = user_id)
  with check (source = 'learned' and auth.uid() = user_id);

grant insert, update on table public.archetype_catalog to authenticated;

comment on table public.archetype_catalog is
  'Curated and user-learned deck archetypes used for battle log identification.';
comment on column public.archetype_catalog.canonical_id is
  'Stable archetype key returned by import identification. Learned rows use a user-scoped primary key and store the sprite archetype key here.';
comment on column public.archetype_catalog.source is
  'curated rows are global catalog entries; learned rows are user-scoped entries promoted from repeated imported self-deck sprites.';
comment on column public.archetype_catalog.user_id is
  'Owner for learned archetype rows. Null for curated global rows.';
comment on column public.archetype_catalog.learned_match_count is
  'Number of matching self-deck logs observed when the learned archetype row was promoted or refreshed.';
