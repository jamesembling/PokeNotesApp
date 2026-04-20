alter table public.archetype_catalog
  add column if not exists required_match_groups jsonb not null default '[]';
