-- Immutable public reference snapshots. Failed/partial syncs never replace active metadata.
create table public.card_definition_generations (
  id uuid primary key,
  source text not null check (source = 'tcgdex'),
  expected_count integer not null check (expected_count > 0),
  source_manifest_hash text not null,
  source_coverage jsonb not null check (jsonb_typeof(source_coverage) = 'object'),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create table public.card_definition_catalog (
  generation_id uuid not null references public.card_definition_generations(id) on delete cascade,
  source_card_id text not null,
  normalized_card_name text not null,
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  check (coalesce(definition->>'sourceCardId' = source_card_id, false)),
  primary key (generation_id, source_card_id)
);
create index card_definition_catalog_name on public.card_definition_catalog (generation_id, normalized_card_name);
create table public.card_definition_active (
  singleton boolean primary key default true check (singleton),
  generation_id uuid not null references public.card_definition_generations(id)
);

alter table public.card_definition_generations enable row level security;
alter table public.card_definition_catalog enable row level security;
alter table public.card_definition_active enable row level security;
revoke all on public.card_definition_generations, public.card_definition_catalog, public.card_definition_active from anon, authenticated;
grant select on public.card_definition_generations, public.card_definition_catalog, public.card_definition_active to anon, authenticated;
grant all on public.card_definition_generations, public.card_definition_catalog, public.card_definition_active to service_role;
create policy "Read completed card definition generations" on public.card_definition_generations for select to anon, authenticated using (completed_at is not null);
create policy "Read completed card definitions" on public.card_definition_catalog for select to anon, authenticated using (
  exists (select 1 from public.card_definition_generations g where g.id = generation_id and g.completed_at is not null)
);
create policy "Read active card definition generation" on public.card_definition_active for select to anon, authenticated using (true);

-- Writers lock the parent row before staging, serializing with publication's FOR UPDATE.
create function public.guard_card_definition_rows()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare target uuid; completed timestamptz;
begin
  if TG_OP = 'UPDATE' then raise exception 'Card definitions are immutable; create a new generation'; end if;
  if TG_OP = 'DELETE' then target := old.generation_id; else target := new.generation_id; end if;
  select completed_at into completed from public.card_definition_generations where id = target for share;
  if completed is not null then raise exception 'Completed card definitions are immutable'; end if;
  -- A cascading DELETE sees its already-deleted parent as absent and can retire old snapshots.
  if TG_OP = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger card_definition_rows_immutable before insert or update or delete on public.card_definition_catalog
  for each row execute function public.guard_card_definition_rows();

create function public.guard_card_definition_generation()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare actual integer;
begin
  if TG_OP = 'UPDATE' and old.completed_at is not null then raise exception 'Completed generation metadata is immutable'; end if;
  if new.completed_at is not null then
    select count(*) into actual from public.card_definition_catalog where generation_id = new.id;
    if actual <> new.expected_count then raise exception 'Cannot complete an incomplete generation'; end if;
  end if;
  return new;
end;
$$;
create trigger card_definition_generation_immutable before insert or update on public.card_definition_generations
  for each row execute function public.guard_card_definition_generation();

create function public.guard_card_definition_active()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.card_definition_generations where id = new.generation_id and completed_at is not null)
    then raise exception 'Only completed card definitions can be active'; end if;
  return new;
end;
$$;
create trigger card_definition_active_complete before insert or update on public.card_definition_active
  for each row execute function public.guard_card_definition_active();
revoke all on function public.guard_card_definition_rows(), public.guard_card_definition_generation(), public.guard_card_definition_active() from public, anon, authenticated;
grant execute on function public.guard_card_definition_rows(), public.guard_card_definition_generation(), public.guard_card_definition_active() to service_role;

create function public.publish_card_definition_generation(target_generation uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare expected integer; actual integer;
begin
  -- Serial publication also prevents concurrent cleanup from racing another publisher.
  perform pg_catalog.pg_advisory_xact_lock(726340028);
  select expected_count into expected from public.card_definition_generations
    where id = target_generation and completed_at is null for update;
  if expected is null then raise exception 'Unknown or already completed card definition generation'; end if;
  select count(*) into actual from public.card_definition_catalog where generation_id = target_generation;
  if actual <> expected then raise exception 'Incomplete card definition generation: expected %, got %', expected, actual; end if;
  update public.card_definition_generations set completed_at = now() where id = target_generation;
  insert into public.card_definition_active (singleton, generation_id) values (true, target_generation)
    on conflict (singleton) do update set generation_id = excluded.generation_id;
  -- Keep two completed snapshots and at least 24h for readers holding an older cached pointer.
  delete from public.card_definition_generations where created_at < now() - interval '24 hours'
    and id <> target_generation and id not in (
      select id from public.card_definition_generations where completed_at is not null order by completed_at desc limit 2
    );
end;
$$;
revoke all on function public.publish_card_definition_generation(uuid) from public, anon, authenticated;
grant execute on function public.publish_card_definition_generation(uuid) to service_role;
comment on table public.card_definition_catalog is 'English TCGdex printing definitions. Only a complete atomically published source snapshot supports candidate agreement. Missing provider fields remain unknown.';
