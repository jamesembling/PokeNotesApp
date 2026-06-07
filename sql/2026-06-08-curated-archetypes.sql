insert into public.archetype_catalog (
  id,
  label,
  sprites,
  detection_sprites,
  required_match_groups,
  is_excluded,
  last_synced_at
)
values
  (
    'hydrapple+ogerpon',
    'Hydrapple / Teal Mask Ogerpon',
    '["hydrapple", "ogerpon"]'::jsonb,
    '["hydrapple", "dipplin", "applin", "ogerpon"]'::jsonb,
    '[["hydrapple", "dipplin", "applin"], ["ogerpon"]]'::jsonb,
    false,
    now()
  ),
  (
    'kangaskhan-mega+slowking',
    'Slowking / Mega Kangaskhan',
    '["slowking", "kangaskhan-mega"]'::jsonb,
    '["slowking", "slowpoke", "kangaskhan-mega"]'::jsonb,
    '[["slowking", "slowpoke"], ["kangaskhan-mega"]]'::jsonb,
    false,
    now()
  ),
  (
    'snorlax+trevenant',
    'Trevenant / Snorlax',
    '["trevenant", "snorlax"]'::jsonb,
    '["trevenant", "phantump", "snorlax"]'::jsonb,
    '[["trevenant", "phantump"], ["snorlax"]]'::jsonb,
    false,
    now()
  ),
  (
    'genesect+metagross',
    'Metagross / Genesect',
    '["metagross", "genesect"]'::jsonb,
    '["metagross", "metang", "beldum", "genesect"]'::jsonb,
    '[["metagross", "metang", "beldum"], ["genesect"]]'::jsonb,
    false,
    now()
  )
on conflict (id) do update
set
  label = excluded.label,
  sprites = excluded.sprites,
  detection_sprites = excluded.detection_sprites,
  required_match_groups = excluded.required_match_groups,
  is_excluded = excluded.is_excluded,
  last_synced_at = excluded.last_synced_at;
