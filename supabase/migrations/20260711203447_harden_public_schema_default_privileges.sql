-- Make every future public-schema interface an explicit API decision. ALTER
-- DEFAULT PRIVILEGES only affects objects created after this migration, so
-- current table, sequence, and function grants remain unchanged.
--
-- Default privileges belong to the role that creates an object. PokeNotes
-- migrations and every current public object use the postgres owner. Fail
-- clearly instead of silently hardening an unrelated migration role.
do $migration_role$
begin
  if not pg_catalog.pg_has_role(current_user, 'postgres', 'MEMBER') then
    raise exception
      'Default privilege migration must run as postgres or a postgres member.';
  end if;
end
$migration_role$;

alter default privileges for role postgres in schema public
  revoke all privileges on tables
  from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all privileges on sequences
  from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions
  from anon, authenticated, service_role;

-- PostgreSQL's built-in function default grants EXECUTE to PUBLIC, and a
-- schema-scoped default REVOKE cannot subtract that global grant. Do not solve
-- that with a global default change: it would also affect future postgres-owned
-- routines in platform/extension schemas. Instead, revoke the implicit grant
-- immediately after application routines are created or replaced in public.
create schema if not exists private;

create or replace function private.harden_new_public_routine_privileges()
returns event_trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  routine_command record;
begin
  for routine_command in
    select command.object_identity
    from pg_catalog.pg_event_trigger_ddl_commands() as command
    join pg_catalog.pg_proc as routine
      on routine.oid = command.objid
    where command.schema_name = 'public'
      and command.object_type in ('function', 'procedure', 'aggregate')
      and not command.in_extension
      and routine.proowner = 'postgres'::regrole
  loop
    execute pg_catalog.format(
      'revoke execute on routine %s from public, anon, authenticated, service_role',
      routine_command.object_identity
    );
  end loop;
end;
$function$;

revoke all on function private.harden_new_public_routine_privileges()
  from public, anon, authenticated, service_role;

drop event trigger if exists pokenotes_harden_public_routine_privileges;
create event trigger pokenotes_harden_public_routine_privileges
  on ddl_command_end
  when tag in ('CREATE FUNCTION', 'CREATE PROCEDURE', 'CREATE AGGREGATE')
  execute function private.harden_new_public_routine_privileges();

-- Rollback (future objects only): restore the live pre-migration defaults with
-- the inverse statements below. Objects created, or routines replaced, while
-- the hardened boundary was active keep their explicit ACLs and must be
-- reviewed separately.
--
-- alter default privileges for role postgres in schema public
--   grant all privileges on tables to anon, authenticated, service_role;
-- alter default privileges for role postgres in schema public
--   grant all privileges on sequences to anon, authenticated, service_role;
-- alter default privileges for role postgres in schema public
--   grant execute on functions to anon, authenticated, service_role;
-- drop event trigger if exists pokenotes_harden_public_routine_privileges;
-- drop function if exists private.harden_new_public_routine_privileges();

-- End future-object default privilege boundary.
