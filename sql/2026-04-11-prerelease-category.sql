-- ============================================================
-- Add prerelease tournament category.
-- Run this in the Supabase SQL editor for existing projects.
-- ============================================================

alter table public.tournaments
  drop constraint if exists tournaments_category_check;

alter table public.tournaments
  add constraint tournaments_category_check
  check (
    category in (
      '',
      'online',
      'local',
      'challenge',
      'cup',
      'prerelease',
      'regional',
      'world'
    )
  );

notify pgrst, 'reload schema';
