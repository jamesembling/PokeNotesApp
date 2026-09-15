alter table public.tournaments
  add column participation text not null default 'player'
    check (participation in ('player', 'judge')),
  add column judge_role text
    check (judge_role in ('judge', 'head judge'));

alter table public.tournaments
  add constraint tournaments_participation_role_consistency
  check (
    (participation = 'player' and judge_role is null) or
    (participation = 'judge' and judge_role is not null and placement = '')
  );

comment on column public.tournaments.participation is
  'Whether the account owner attended this event as a player or judge.';

comment on column public.tournaments.judge_role is
  'Judge responsibility for judge participation: judge or head judge.';
