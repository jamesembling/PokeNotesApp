alter table public.route_performance_events
  add column if not exists server_auth_refreshed boolean,
  add column if not exists server_route_entered_ms integer;

comment on column public.route_performance_events.server_route_entered_ms is
  'Route component entry offset from Proxy request start; brackets the opaque post-Proxy platform/framework interval.';

comment on column public.route_performance_events.server_auth_refreshed is
  'Whether Proxy wrote updated Supabase session cookies during authentication.';
