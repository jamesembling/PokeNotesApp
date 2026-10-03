-- Synthetic, transaction-scoped exercise of the actual migration boundary.
-- Run only through migration:rehearse:local against its disposable database.
begin;
set local role service_role;
insert into public.card_definition_generations (id, source, expected_count, source_manifest_hash, source_coverage)
values ('00000000-0000-4000-8000-000000000001', 'tcgdex', 2, 'synthetic', '{"scope":"tcgdex-listed-en-physical","listedPrintings":2,"unlistedSets":[]}');
insert into public.card_definition_catalog values
  ('00000000-0000-4000-8000-000000000001', 'synthetic-1', 'synthetic', '{"sourceCardId":"synthetic-1"}');

do $$ begin
  begin
    perform public.publish_card_definition_generation('00000000-0000-4000-8000-000000000001');
    raise exception 'ASSERT: incomplete publication succeeded';
  exception when others then
    if SQLERRM like 'ASSERT:%' then raise; end if;
  end;
  if exists (select 1 from public.card_definition_active) then raise exception 'Failed publication changed the active pointer'; end if;
  begin
    insert into public.card_definition_active values (true, '00000000-0000-4000-8000-000000000001');
    raise exception 'ASSERT: staging pointer accepted';
  exception when others then
    if SQLERRM like 'ASSERT:%' then raise; end if;
  end;
end $$;

set local role anon;
do $$ begin
  if exists (select 1 from public.card_definition_generations) or exists (select 1 from public.card_definition_catalog) then
    raise exception 'Staging metadata is visible to anon';
  end if;
  if has_table_privilege('anon', 'public.card_definition_catalog', 'INSERT,UPDATE,DELETE')
    or has_function_privilege('anon', 'public.publish_card_definition_generation(uuid)', 'EXECUTE') then
    raise exception 'Anonymous publication or write privilege';
  end if;
end $$;
set local role authenticated;
do $$ begin
  if exists (select 1 from public.card_definition_catalog) then raise exception 'Staging metadata visible to authenticated'; end if;
  if has_table_privilege('authenticated', 'public.card_definition_catalog', 'INSERT,UPDATE,DELETE')
    or has_function_privilege('authenticated', 'public.publish_card_definition_generation(uuid)', 'EXECUTE') then
    raise exception 'Authenticated publication or write privilege';
  end if;
end $$;

set local role service_role;
insert into public.card_definition_catalog values
  ('00000000-0000-4000-8000-000000000001', 'synthetic-2', 'synthetic', '{"sourceCardId":"synthetic-2"}');
select public.publish_card_definition_generation('00000000-0000-4000-8000-000000000001');
do $$ begin
  if (select generation_id from public.card_definition_active) <> '00000000-0000-4000-8000-000000000001'::uuid then raise exception 'Pointer publication failed'; end if;
  begin
    update public.card_definition_catalog set definition = '{"sourceCardId":"synthetic-1","hp":999}' where source_card_id = 'synthetic-1';
    raise exception 'ASSERT: completed row update succeeded';
  exception when others then if SQLERRM like 'ASSERT:%' then raise; end if; end;
  begin
    delete from public.card_definition_catalog where source_card_id = 'synthetic-1';
    raise exception 'ASSERT: completed row deletion succeeded';
  exception when others then if SQLERRM like 'ASSERT:%' then raise; end if; end;
  begin
    insert into public.card_definition_catalog values ('00000000-0000-4000-8000-000000000001', 'synthetic-3', 'synthetic', '{"sourceCardId":"synthetic-3"}');
    raise exception 'ASSERT: completed row insertion succeeded';
  exception when others then if SQLERRM like 'ASSERT:%' then raise; end if; end;
  begin
    update public.card_definition_generations set completed_at = null where id = '00000000-0000-4000-8000-000000000001';
    raise exception 'ASSERT: completed metadata mutation succeeded';
  exception when others then if SQLERRM like 'ASSERT:%' then raise; end if; end;
  begin
    perform public.publish_card_definition_generation('00000000-0000-4000-8000-000000000099');
    raise exception 'ASSERT: unknown generation published';
  exception when others then if SQLERRM like 'ASSERT:%' then raise; end if; end;
end $$;

set local role anon;
do $$ begin
  if (select count(*) from public.card_definition_catalog) <> 2 then raise exception 'Published catalogue not readable'; end if;
end $$;
set local role authenticated;
do $$ begin
  if (select count(*) from public.card_definition_catalog) <> 2 then raise exception 'Published catalogue not readable'; end if;
end $$;

-- Retiring an old completed parent must permit cascading deletion while protecting the active parent.
set local role service_role;
insert into public.card_definition_generations (id, source, expected_count, source_manifest_hash, source_coverage)
values ('00000000-0000-4000-8000-000000000002', 'tcgdex', 1, 'synthetic-next', '{}');
insert into public.card_definition_catalog values
  ('00000000-0000-4000-8000-000000000002', 'synthetic-1', 'synthetic', '{"sourceCardId":"synthetic-1"}');
select public.publish_card_definition_generation('00000000-0000-4000-8000-000000000002');
delete from public.card_definition_generations where id = '00000000-0000-4000-8000-000000000001';
do $$ begin
  if exists (select 1 from public.card_definition_catalog where generation_id = '00000000-0000-4000-8000-000000000001') then raise exception 'Retention cleanup failed'; end if;
  if (select count(*) from public.card_definition_catalog) <> 1 then raise exception 'Retention changed active snapshot'; end if;
end $$;
rollback;
