-- Replaying 20261017230637_festival_lead_damage_repair.sql onto a database without
-- the reviewed Battle Logs must succeed and leave it unchanged. The guarded repair,
-- concurrency, repeat and rollback behavior is rehearsed by
-- scripts/rehearse-festival-damage-repair.mjs against the local E2E database.
do $$
begin
  if not exists (
    select 1 from supabase_migrations.schema_migrations where version = '20261017230637'
  ) then
    raise exception 'The Festival Lead damage repair migration was not applied.';
  end if;

  if exists (
    select 1 from public.logs
    where id in ('4cc0e1aa-7775-47f0-b2fe-26ba576da70e', 'log-kquv8agw', 'perf-log-kquv8agw')
  ) then
    raise exception 'A database without reviewed Battle Logs gained repair rows.';
  end if;
end
$$;
