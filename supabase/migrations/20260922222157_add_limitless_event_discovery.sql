-- The scheduled importer owns this last-good snapshot. Dashboard reads remain
-- available when Limitless is temporarily unreachable.
create table public.limitless_event_feed (
  feed_key text primary key check (feed_key = 'ptcg-standard-ptcgl'),
  events jsonb not null default '[]'::jsonb
    check (jsonb_typeof(events) = 'array' and jsonb_array_length(events) <= 500),
  refreshed_at timestamptz not null default now()
);

create table public.user_event_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  search_query text not null default '' check (char_length(search_query) <= 120),
  starts_after text not null default ''
    check (starts_after = '' or starts_after ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  starts_before text not null default ''
    check (starts_before = '' or starts_before ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  updated_at timestamptz not null default now()
);

create table public.user_event_pins (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null check (event_id ~ '^[0-9a-f]{24}$'),
  event_snapshot jsonb not null
    check (jsonb_typeof(event_snapshot) = 'object' and octet_length(event_snapshot::text) <= 4096),
  pinned_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create index user_event_pins_user_pinned_at_idx
  on public.user_event_pins (user_id, pinned_at desc);

alter table public.limitless_event_feed enable row level security;
alter table public.user_event_preferences enable row level security;
alter table public.user_event_pins enable row level security;

revoke all on table public.limitless_event_feed from public, anon, authenticated;
revoke all on table public.user_event_preferences from public, anon, authenticated;
revoke all on table public.user_event_pins from public, anon, authenticated;

grant select on table public.limitless_event_feed to authenticated;
grant select, insert, update on table public.user_event_preferences to authenticated;
grant select, insert, delete on table public.user_event_pins to authenticated;
grant all on table public.limitless_event_feed, public.user_event_preferences, public.user_event_pins to service_role;

create policy "Authenticated users can read Limitless event feed"
  on public.limitless_event_feed for select to authenticated
  using (true);

create policy "Users can read own event preferences"
  on public.user_event_preferences for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can create own event preferences"
  on public.user_event_preferences for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can update own event preferences"
  on public.user_event_preferences for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can read own event pins"
  on public.user_event_pins for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can create own event pins"
  on public.user_event_pins for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can remove own event pins"
  on public.user_event_pins for delete to authenticated
  using ((select auth.uid()) = user_id);
