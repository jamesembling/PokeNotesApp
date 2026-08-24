alter table public.route_performance_events
  add column if not exists final_response_headers_start_ms integer,
  add column if not exists first_interim_response_start_ms integer;

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
      'logs-public-shell-canary',
      'logs-shell-only'
    )
  );

comment on column public.route_performance_events.final_response_headers_start_ms is
  'Browser navigation timing for final response headers when the browser exposes that boundary.';

comment on column public.route_performance_events.first_interim_response_start_ms is
  'Browser navigation timing for the first interim response, such as 103 Early Hints, when exposed.';

comment on column public.route_performance_events.response_stream_ms is
  'Time from final response headers when exposed, otherwise legacy responseStart, to response end; includes streamed server pauses and is not pure network download time.';
