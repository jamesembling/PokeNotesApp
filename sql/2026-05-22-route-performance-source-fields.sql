alter table public.route_performance_events
  add column if not exists source_origin text,
  add column if not exists source_host text,
  add column if not exists deployment_env text not null default 'unknown';

update public.route_performance_events
set deployment_env = case
  when coalesce(source_host, '') ~ '^(localhost|127\.0\.0\.1)(:|$)' then 'local'
  when source_host = 'poke-notes-app.vercel.app' then 'production'
  when coalesce(source_host, '') like '%.vercel.app' then 'preview'
  else deployment_env
end
where deployment_env = 'unknown';

create index if not exists route_performance_events_env_route_created_at
  on public.route_performance_events (deployment_env, to_path, created_at desc);
