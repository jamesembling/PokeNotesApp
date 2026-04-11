-- ============================================================
-- Add local tournament placement options.
-- Run this in the Supabase SQL editor for existing projects.
-- ============================================================

alter table public.tournaments
  drop constraint if exists tournaments_placement_check;

alter table public.tournaments
  add constraint tournaments_placement_check
  check (
    placement in (
      '',
      'no placement',
      'dropped',
      'second',
      'third',
      'fourth',
      'fifth',
      'sixth',
      'seventh',
      'eighth',
      't1024',
      't512',
      't256',
      't128',
      't64',
      't32',
      't16',
      't8',
      't4',
      'finalist',
      'champion'
    )
  );

notify pgrst, 'reload schema';
