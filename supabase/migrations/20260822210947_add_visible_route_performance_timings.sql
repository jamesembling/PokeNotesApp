alter table public.route_performance_events
  add column if not exists first_contentful_paint_ms integer,
  add column if not exists largest_contentful_paint_ms integer,
  add column if not exists route_content_visible_ms integer,
  add column if not exists shell_profile_loaded_ms integer,
  add column if not exists shell_visible_ms integer;

comment on column public.route_performance_events.first_contentful_paint_ms is
  'Browser First Contentful Paint measured from the start of a hard navigation.';

comment on column public.route_performance_events.largest_contentful_paint_ms is
  'Latest buffered Largest Contentful Paint available when the hard-load event is reported.';

comment on column public.route_performance_events.route_content_visible_ms is
  'Time from navigation start until the route primary content has hydrated and is usable.';

comment on column public.route_performance_events.shell_profile_loaded_ms is
  'Time from navigation start until the deferred sidebar profile has loaded; null when it was not requested.';

comment on column public.route_performance_events.shell_visible_ms is
  'Time from navigation start until the shared application shell has hydrated.';
