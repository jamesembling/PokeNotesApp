-- Supports the user-local learned self-deck lookup during log import.
-- The importer only checks this when catalog archetype detection misses.

create index if not exists logs_user_self_deck_sprites
  on public.logs (user_id, self_deck_sprites)
  where nullif(trim(self_deck_sprites), '') is not null;
