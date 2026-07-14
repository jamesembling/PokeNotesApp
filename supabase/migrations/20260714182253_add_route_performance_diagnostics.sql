alter table public.route_performance_events
  add column if not exists browser_family text not null default 'unknown',
  add column if not exists device_class text not null default 'unknown',
  add column if not exists deployment_id text,
  add column if not exists document_download_ms integer,
  add column if not exists navigation_type text not null default 'unknown',
  add column if not exists reporter_version smallint not null default 1,
  add column if not exists response_end_ms integer,
  add column if not exists route_stabilization_ms integer,
  add column if not exists server_auth_ms integer,
  add column if not exists server_route_data_ms integer,
  add column if not exists server_shell_profile_ms integer,
  add column if not exists traffic_class text not null default 'unclassified',
  add column if not exists visibility_state text not null default 'unknown';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'route_performance_events_browser_family_check'
  ) then
    alter table public.route_performance_events
      add constraint route_performance_events_browser_family_check
      check (browser_family in ('chromium', 'firefox', 'other', 'safari', 'unknown'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'route_performance_events_device_class_check'
  ) then
    alter table public.route_performance_events
      add constraint route_performance_events_device_class_check
      check (device_class in ('desktop', 'mobile', 'tablet', 'unknown'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'route_performance_events_navigation_type_check'
  ) then
    alter table public.route_performance_events
      add constraint route_performance_events_navigation_type_check
      check (navigation_type in ('app-route', 'back_forward', 'navigate', 'prerender', 'reload', 'unknown'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'route_performance_events_reporter_version_check'
  ) then
    alter table public.route_performance_events
      add constraint route_performance_events_reporter_version_check
      check (reporter_version > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'route_performance_events_traffic_class_check'
  ) then
    alter table public.route_performance_events
      add constraint route_performance_events_traffic_class_check
      check (traffic_class in ('automation', 'unclassified'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'route_performance_events_visibility_state_check'
  ) then
    alter table public.route_performance_events
      add constraint route_performance_events_visibility_state_check
      check (visibility_state in ('hidden', 'prerender', 'unknown', 'visible'));
  end if;
end
$$;

create index if not exists route_performance_events_env_traffic_route_created_at
  on public.route_performance_events (deployment_env, traffic_class, to_path, created_at desc);

comment on column public.route_performance_events.traffic_class is
  'Explicit performance-harness classification; all other traffic remains unclassified rather than inferred human.';

comment on column public.route_performance_events.server_auth_ms is
  'Sanitized proxy authentication duration from the allowlisted Server-Timing metric.';

comment on column public.route_performance_events.server_shell_profile_ms is
  'Sanitized shared-shell profile duration rendered by the application timing marker.';

comment on column public.route_performance_events.server_route_data_ms is
  'Sanitized route-data duration rendered by the application timing marker.';
