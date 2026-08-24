insert into public.archetype_catalog (
  id,
  canonical_id,
  label,
  sprites,
  detection_sprites,
  required_match_groups,
  is_excluded,
  source,
  user_id,
  learned_match_count,
  last_synced_at
)
values (
  'excadrill-mega+metagross',
  'excadrill-mega+metagross',
  'Mega Excadrill / Metagross',
  '["excadrill-mega", "metagross"]'::jsonb,
  '["excadrill-mega", "excadrill", "drilbur", "metagross", "metang", "beldum"]'::jsonb,
  '[["excadrill-mega", "excadrill", "drilbur"], ["metagross", "metang", "beldum"]]'::jsonb,
  false,
  'curated',
  null,
  0,
  now()
)
on conflict (id) do update
set canonical_id = excluded.canonical_id,
    label = excluded.label,
    sprites = excluded.sprites,
    detection_sprites = excluded.detection_sprites,
    required_match_groups = excluded.required_match_groups,
    is_excluded = false,
    source = 'curated',
    user_id = null,
    learned_match_count = 0,
    last_synced_at = excluded.last_synced_at;
