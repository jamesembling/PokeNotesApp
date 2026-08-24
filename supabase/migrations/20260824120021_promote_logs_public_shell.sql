alter table public.route_performance_events
  drop constraint if exists route_performance_events_performance_variant_check;

alter table public.route_performance_events
  add constraint route_performance_events_performance_variant_check
  check (
    performance_variant is null
    or performance_variant in (
      'logs-delay-400',
      'logs-delay-1000',
      'logs-narrow-suspense',
      'logs-public-shell',
      'logs-public-shell-canary',
      'logs-shell-only'
    )
  );
