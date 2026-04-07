alter table public.archetype_catalog
  add column if not exists detection_sprites jsonb not null default '[]';

update public.archetype_catalog
set detection_sprites = sprites
where detection_sprites = '[]'::jsonb;
