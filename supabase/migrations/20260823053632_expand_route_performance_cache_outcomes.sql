alter table public.route_performance_events
  drop constraint if exists route_performance_events_cache_outcome_check;

alter table public.route_performance_events
  add constraint route_performance_events_cache_outcome_check
  check (
    server_cache_outcome is null
    or server_cache_outcome in (
      'fallback',
      'fallback-cache-error',
      'fallback-invalid-payload',
      'fallback-rpc-error',
      'hit',
      'miss'
    )
  ) not valid;

alter table public.route_performance_events
  validate constraint route_performance_events_cache_outcome_check;

comment on column public.route_performance_events.server_cache_outcome is
  'Observed initial logs cache outcome: hit, miss, legacy fallback, or a specific fallback failure reason.';
