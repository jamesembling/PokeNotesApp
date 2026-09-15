alter table public.tournaments
  add column championship_points integer;

alter table public.tournaments
  add constraint tournaments_championship_points_check
  check (championship_points is null or championship_points >= 0);

comment on column public.tournaments.championship_points is
  'Optional Championship Points awarded for the tournament.';
