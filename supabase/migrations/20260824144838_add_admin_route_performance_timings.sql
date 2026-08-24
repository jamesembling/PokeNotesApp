alter table public.route_performance_events
  add column if not exists server_admin_access_ms integer,
  add column if not exists server_admin_overview_ms integer,
  add column if not exists server_admin_users_ms integer;

comment on column public.route_performance_events.server_admin_access_ms is
  'Server duration for the admin authorization and profile lookup.';

comment on column public.route_performance_events.server_admin_overview_ms is
  'Server duration for the admin summary overview query.';

comment on column public.route_performance_events.server_admin_users_ms is
  'Server duration for the admin user-management query.';
