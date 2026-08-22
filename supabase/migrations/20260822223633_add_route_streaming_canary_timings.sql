alter table public.route_performance_events
  add column if not exists document_decoded_body_size_bytes integer,
  add column if not exists document_encoded_body_size_bytes integer,
  add column if not exists document_transfer_size_bytes integer,
  add column if not exists next_hop_protocol text,
  add column if not exists performance_variant text,
  add column if not exists route_data_visible_ms integer,
  add column if not exists route_shell_visible_ms integer,
  add column if not exists worker_start_ms integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'route_performance_events_performance_variant_check'
  ) then
    alter table public.route_performance_events
      add constraint route_performance_events_performance_variant_check
      check (
        performance_variant is null
        or performance_variant in (
          'logs-delay-1000',
          'logs-narrow-suspense',
          'logs-shell-only'
        )
      );
  end if;
end
$$;

comment on column public.route_performance_events.performance_variant is
  'Allowlisted route implementation or canary variant used for causal performance comparison.';

comment on column public.route_performance_events.route_shell_visible_ms is
  'Time from navigation start until the real route shell has hydrated.';

comment on column public.route_performance_events.route_data_visible_ms is
  'Time from navigation start until the route data region has hydrated.';

comment on column public.route_performance_events.document_transfer_size_bytes is
  'Navigation document transfer size reported by the Resource Timing API.';

comment on column public.route_performance_events.document_encoded_body_size_bytes is
  'Navigation document encoded body size reported by the Resource Timing API.';

comment on column public.route_performance_events.document_decoded_body_size_bytes is
  'Navigation document decoded body size reported by the Resource Timing API.';

comment on column public.route_performance_events.next_hop_protocol is
  'Navigation protocol reported by the Resource Timing API, such as h2 or h3.';

comment on column public.route_performance_events.worker_start_ms is
  'Navigation worker start time, or zero when no service worker intercepted the request.';
