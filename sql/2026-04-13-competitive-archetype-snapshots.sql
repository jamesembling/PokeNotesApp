create table if not exists public.competitive_archetype_snapshots (
  archetype_id      text not null,
  sample_days       integer not null default 7,
  appearance_count  integer not null default 0,
  best_finish       integer,
  average_finish    numeric(6,2),
  top_cut_count     integer not null default 0,
  results           jsonb not null default '[]',
  source            text not null default 'limitless'
                      check (source in ('limitless')),
  synced_at         timestamptz not null default now(),

  primary key (archetype_id, sample_days)
);

comment on table public.competitive_archetype_snapshots is
  'Cached recent competitive archetype results from Limitless. Refreshed in controlled background syncs.';

comment on column public.competitive_archetype_snapshots.results is
  'Array of top competitive results for the archetype, including public decklist links.';

create index if not exists competitive_archetype_snapshots_synced_at
  on public.competitive_archetype_snapshots (synced_at desc);

alter table public.competitive_archetype_snapshots enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'competitive_archetype_snapshots'
      and policyname = 'Anyone can read competitive archetype snapshots'
  ) then
    create policy "Anyone can read competitive archetype snapshots"
      on public.competitive_archetype_snapshots for select
      using (true);
  end if;
end $$;
