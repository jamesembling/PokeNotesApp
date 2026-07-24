alter table public.logs
  add column if not exists match_notes text;

alter table public.logs
  drop constraint if exists logs_match_notes_normalized;

alter table public.logs
  add constraint logs_match_notes_normalized
  check (
    match_notes is null
    or (
      match_notes = btrim(match_notes, E' \t\n\r')
      and length(match_notes) > 0
    )
  ) not valid;

alter table public.logs
  validate constraint logs_match_notes_normalized;

comment on column public.logs.match_notes is
  'Private owner-only free-text notes captured during import. Never include in public share payloads.';
