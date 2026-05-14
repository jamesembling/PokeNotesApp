create table if not exists public.route_performance_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('hard-load', 'app-route')),
  from_path text,
  to_path text not null,
  duration_ms integer not null,
  loading_ms integer,
  ttfb_ms integer,
  dom_content_loaded_ms integer,
  load_event_ms integer,
  total_blocking_time_ms integer,
  max_long_task_ms integer,
  resource_count integer,
  slowest_resource_path text,
  slowest_resource_ms integer,
  transfer_size_bytes integer,
  viewport_width integer,
  viewport_height integer,
  screen_width integer,
  screen_height integer,
  hardware_concurrency integer,
  device_memory numeric,
  effective_type text,
  downlink numeric,
  rtt integer,
  save_data boolean not null default false,
  user_agent text,
  created_at timestamptz not null default now()
);

comment on table public.route_performance_events is
  'Real-user route timing events captured from authenticated app sessions.';

grant select, insert on table public.route_performance_events to authenticated;
grant all privileges on table public.route_performance_events to service_role;

create index if not exists route_performance_events_created_at
  on public.route_performance_events (created_at desc);

create index if not exists route_performance_events_user_created_at
  on public.route_performance_events (user_id, created_at desc);

create index if not exists route_performance_events_route_created_at
  on public.route_performance_events (to_path, created_at desc);

alter table public.route_performance_events enable row level security;

drop policy if exists "Users can insert own route performance events"
  on public.route_performance_events;
create policy "Users can insert own route performance events"
  on public.route_performance_events for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own route performance events"
  on public.route_performance_events;
create policy "Users can read own route performance events"
  on public.route_performance_events for select
  using (auth.uid() = user_id);

drop policy if exists "Admins can read route performance events"
  on public.route_performance_events;
create policy "Admins can read route performance events"
  on public.route_performance_events for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );
