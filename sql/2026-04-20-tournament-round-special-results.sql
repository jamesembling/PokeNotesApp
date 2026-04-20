-- ============================================================
-- Add ID and NO SHOW as valid tournament round special results.
-- Run this in the Supabase SQL editor for existing projects.
-- ============================================================

alter table public.tournament_rounds
  drop constraint if exists tournament_rounds_result_check;

alter table public.tournament_rounds
  add constraint tournament_rounds_result_check
  check (
    result in ('BYE', 'ID', 'NO SHOW') OR
    result in ('Win', 'Loss', 'Tie') OR
    result ~ '^[WLT]{1,3}$'
  );

notify pgrst, 'reload schema';
