alter table public.tournaments
  add column tournament_identifier text not null default '',
  add column location text not null default '';

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
      'international',
      'world'
    )
  );

comment on column public.tournaments.tournament_identifier is
  'Optional organizer-facing Tournament ID, such as a Play! Pokemon event identifier.';

comment on column public.tournaments.location is
  'Optional venue, store, city, or online location supplied by the user.';
