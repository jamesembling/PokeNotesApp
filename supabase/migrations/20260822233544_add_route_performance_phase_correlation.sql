alter table public.route_performance_events
  add column if not exists connect_ms integer,
  add column if not exists dns_ms integer,
  add column if not exists hydration_resources_end_ms integer,
  add column if not exists parser_data_ms integer,
  add column if not exists parser_shell_ms integer,
  add column if not exists request_correlation_id text,
  add column if not exists request_start_ms integer,
  add column if not exists response_start_ms integer,
  add column if not exists response_stream_ms integer,
  add column if not exists route_data_painted_ms integer,
  add column if not exists route_shell_painted_ms integer,
  add column if not exists server_auth_ended_ms integer,
  add column if not exists server_auth_method text,
  add column if not exists server_auth_started_ms integer,
  add column if not exists server_cache_key_version text,
  add column if not exists server_cache_lookup_ms integer,
  add column if not exists server_cache_outcome text,
  add column if not exists server_function_region text,
  add column if not exists server_mapping_ms integer,
  add column if not exists server_request_id text,
  add column if not exists server_result_bytes integer,
  add column if not exists server_result_rows integer,
  add column if not exists server_route_data_ended_ms integer,
  add column if not exists server_route_data_started_ms integer,
  add column if not exists server_runtime_boot_age_ms integer,
  add column if not exists server_runtime_boot_id text,
  add column if not exists server_runtime_invocation_ordinal integer,
  add column if not exists server_supabase_ms integer,
  add column if not exists submission_reason text,
  add column if not exists tls_ms integer;

alter table public.route_performance_events
  drop constraint if exists route_performance_events_event_type_check;

alter table public.route_performance_events
  add constraint route_performance_events_event_type_check
  check (event_type in ('app-route', 'hard-load', 'route-data')) not valid;

alter table public.route_performance_events
  validate constraint route_performance_events_event_type_check;

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
      'logs-shell-only'
    )
  ) not valid;

alter table public.route_performance_events
  validate constraint route_performance_events_performance_variant_check;

alter table public.route_performance_events
  add constraint route_performance_events_submission_reason_check
  check (
    submission_reason is null
    or submission_reason in ('app-route', 'data-parsed', 'data-seen', 'data-timeout', 'initial-load', 'page-hidden')
  ) not valid;

alter table public.route_performance_events
  validate constraint route_performance_events_submission_reason_check;

alter table public.route_performance_events
  add constraint route_performance_events_cache_outcome_check
  check (
    server_cache_outcome is null
    or server_cache_outcome in ('fallback', 'hit', 'miss')
  ) not valid;

alter table public.route_performance_events
  validate constraint route_performance_events_cache_outcome_check;

create index if not exists route_performance_events_request_correlation_id
  on public.route_performance_events (request_correlation_id)
  where request_correlation_id is not null;

comment on column public.route_performance_events.response_stream_ms is
  'Time from the first navigation response byte to the last; includes streamed server pauses and is not pure network download time.';

comment on column public.route_performance_events.document_download_ms is
  'Legacy reporter-v2-v4 name for response stream duration; retained for backward compatibility.';

comment on column public.route_performance_events.parser_shell_ms is
  'Parser-time arrival of the route shell marker from navigation start.';

comment on column public.route_performance_events.parser_data_ms is
  'Parser-time arrival of the streamed route-data marker from navigation start.';

comment on column public.route_performance_events.route_shell_painted_ms is
  'Double-animation-frame approximation after the route shell React commit.';

comment on column public.route_performance_events.route_data_painted_ms is
  'Double-animation-frame approximation after the route data React commit.';

comment on column public.route_performance_events.submission_reason is
  'Why this correlated telemetry event was submitted, including explicit timeout and page-hide outcomes.';

comment on column public.route_performance_events.request_correlation_id is
  'Opaque per-navigation identifier shared by document markers and correlated telemetry events.';

comment on column public.route_performance_events.server_cache_outcome is
  'Observed initial logs cache outcome for the request: hit, miss, or legacy fallback.';
