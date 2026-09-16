alter table public.tournaments
  add column professor_points integer;

alter table public.tournaments
  add constraint tournaments_professor_points_check
  check (professor_points is null or professor_points >= 0);

update public.tournaments
set
  professor_points = championship_points,
  championship_points = null
where participation = 'judge'
  and championship_points is not null;

comment on column public.tournaments.professor_points is
  'Optional Professor Points awarded for judging the tournament.';
