#!/usr/bin/env node

import { spawnSync } from "node:child_process";

function databaseTarget(args = process.argv.slice(2), env = process.env) {
  if (args.length === 0) {
    return { args: ["--linked"], redact: (output) => output };
  }

  if (args.length !== 2 || args[0] !== "--db-url-env") {
    throw new Error(
      "Usage: node scripts/schema-health.mjs [--db-url-env ENVIRONMENT_VARIABLE]"
    );
  }

  const variableName = args[1];
  if (!/^[A-Z][A-Z0-9_]*$/.test(variableName)) {
    throw new Error("Database URL environment variable must use an uppercase shell-safe name.");
  }

  const databaseUrl = env[variableName];
  if (!databaseUrl) {
    throw new Error(`Database URL environment variable ${variableName} is not set.`);
  }

  const secrets = new Set([databaseUrl]);
  try {
    const parsed = new URL(databaseUrl);
    const addCredential = (value) => {
      if (!value) return;
      secrets.add(value);
      try {
        secrets.add(decodeURIComponent(value));
      } catch {
        // Keep the original credential when it is not valid percent-encoding.
      }
    };

    for (const value of [parsed.username, parsed.password]) {
      addCredential(value);
    }

    const credentialParameters = new Set(["user", "password", "sslpassword"]);
    for (const name of credentialParameters) {
      for (const value of parsed.searchParams.getAll(name)) {
        addCredential(value);
      }
    }
    for (const parameter of parsed.search.slice(1).split("&")) {
      const separator = parameter.indexOf("=");
      const rawName = separator < 0 ? parameter : parameter.slice(0, separator);
      const rawValue = separator < 0 ? "" : parameter.slice(separator + 1);
      try {
        if (credentialParameters.has(decodeURIComponent(rawName))) {
          addCredential(rawValue);
        }
      } catch {
        // The exact database URL remains redacted if a parameter name is malformed.
      }
    }
  } catch {
    // Target validation belongs to Supabase; redact the exact supplied value regardless.
  }
  const orderedSecrets = [...secrets].filter(Boolean).sort((left, right) => right.length - left.length);

  return {
    args: ["--db-url", databaseUrl],
    redact(output) {
      let redacted = output;
      for (const secret of orderedSecrets) {
        redacted = redacted.replaceAll(secret, "[REDACTED]");
      }
      return redacted;
    }
  };
}

let target;

try {
  target = databaseTarget();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

const REQUIRED_COLUMNS = {
  deck_log_stats: [
    "user_id",
    "deck_id",
    "games_played",
    "games_won",
    "games_lost",
    "created_at",
    "updated_at"
  ],
  deck_lists: [
    "id",
    "deck_id",
    "user_id",
    "creation_key",
    "name",
    "format",
    "date",
    "created_by",
    "notes",
    "raw_list",
    "parsed_cards",
    "sorted_cards",
    "sorted_cards_version",
    "position",
    "created_at",
    "updated_at"
  ],
  deck_matchups: [
    "id",
    "deck_id",
    "user_id",
    "deck_name",
    "deck_pokemon",
    "format",
    "go_preference",
    "matchup_favor",
    "ideal_bench",
    "techs_needed",
    "matchup_plan",
    "position",
    "created_at",
    "updated_at"
  ],
  decks: [
    "id",
    "user_id",
    "deck_name",
    "archetype_id",
    "format",
    "go_preference",
    "deck_pokemon",
    "core_strategy",
    "general_notes",
    "setup_goals",
    "resource_plan",
    "matchups",
    "deck_lists",
    "created_at",
    "updated_at"
  ],
  log_shares: [
    "id",
    "owner_user_id",
    "source_log_id",
    "payload",
    "expires_at",
    "created_at",
    "updated_at"
  ],
  logs: [
    "id",
    "user_id",
    "date",
    "result",
    "format",
    "go_order",
    "self_player_name",
    "self_deck_name",
    "self_deck_slug",
    "self_deck_sprites",
    "opponent_player_name",
    "opponent_deck_name",
    "opponent_deck_slug",
    "opponent_deck_sprites",
    "total_turns",
    "coin_toss_won",
    "self_prizes_taken",
    "opponent_prizes_taken",
    "self_attack_damage",
    "opponent_attack_damage",
    "self_mulligans",
    "opponent_mulligans",
    "linked_deck_id",
    "linked_deck_list_id",
    "reason",
    "raw_log",
    "sections",
    "search_vector",
    "imported_at",
    "created_at",
    "updated_at"
  ],
  tournaments: [
    "id",
    "user_id",
    "name",
    "tournament_identifier",
    "location",
    "championship_points",
    "date_from",
    "date_to",
    "linked_deck_id",
    "linked_deck_list_id",
    "deck_name",
    "deck_sprites",
    "category",
    "placement",
    "participation",
    "judge_role",
    "format",
    "notes",
    "created_at",
    "updated_at"
  ]
};

const REQUIRED_FUNCTIONS = [
  "commit_deck_aggregate_child",
  "commit_first_class_deck_list",
  "create_log_share",
  "can_use_deck_list_reference",
  "clear_orphaned_deck_list_link",
  "delete_first_class_deck_list",
  "delete_owned_deck",
  "get_active_log_share",
  "get_admin_dashboard_overview",
  "get_admin_users_overview",
  "get_archetype_matchup_key",
  "get_deck_index",
  "get_deck_index_stats",
  "get_log_stats_overview",
  "refresh_deck_log_stats",
  "refresh_user_archetype_matchup_stats",
  "refresh_user_log_stats",
  "revoke_log_share",
  "remove_deleted_deck_list_legacy_copy",
  "preserve_deleted_deck_legacy_references",
  "preserve_deleted_deck_references_before_delete",
  "set_deck_list_association",
  "sync_deck_log_stats_from_log_row",
  "sync_current_profile",
  "sync_user_archetype_matchup_stats_from_log_row",
  "sync_user_log_stats_from_log_row",
  "set_profile_role",
  "touch_current_profile_activity"
];

const REQUIRED_CONSTRAINT_DEFINITIONS = {
  deck_lists_owner_deck_fkey:
    "FOREIGN KEY (user_id, deck_id) REFERENCES decks(user_id, id) ON DELETE SET NULL (deck_id)",
  deck_lists_pkey: "PRIMARY KEY (user_id, id)",
  deck_log_stats_owner_deck_fkey:
    "FOREIGN KEY (user_id, deck_id) REFERENCES decks(user_id, id) ON DELETE CASCADE",
  deck_matchups_owner_deck_fkey:
    "FOREIGN KEY (user_id, deck_id) REFERENCES decks(user_id, id) ON DELETE CASCADE",
  decks_user_id_id_unique: "UNIQUE (user_id, id)",
  log_shares_payload_v1_envelope:
    "CHECK (NOT jsonb_typeof(payload) IS DISTINCT FROM 'object'::text AND NOT (payload ->> 'version'::text) IS DISTINCT FROM 'v1'::text AND NOT jsonb_typeof(payload -> 'log'::text) IS DISTINCT FROM 'object'::text AND NOT jsonb_typeof(payload #> '{log,sections}'::text[]) IS DISTINCT FROM 'array'::text AND NOT jsonb_typeof(payload -> 'linkedStrategyLabel'::text) IS DISTINCT FROM 'string'::text AND (NOT payload ? 'linkedDeckListSortedCards'::text OR (jsonb_typeof(payload -> 'linkedDeckListSortedCards'::text) = ANY (ARRAY['array'::text, 'null'::text]))))",
  log_shares_payload_max_256k:
    "CHECK (octet_length(payload::text) <= 262144)",
  logs_owner_linked_deck_fkey:
    "FOREIGN KEY (user_id, linked_deck_id) REFERENCES decks(user_id, id) ON DELETE SET NULL (linked_deck_id)",
  tournament_rounds_owner_tournament_fkey:
    "FOREIGN KEY (user_id, tournament_id) REFERENCES tournaments(user_id, id) ON DELETE CASCADE",
  tournaments_owner_linked_deck_fkey:
    "FOREIGN KEY (user_id, linked_deck_id) REFERENCES decks(user_id, id) ON DELETE SET NULL (linked_deck_id)",
  tournaments_user_id_id_unique: "UNIQUE (user_id, id)"
};

const REQUIRED_CONSTRAINTS = Object.keys(REQUIRED_CONSTRAINT_DEFINITIONS);

const REQUIRED_INDEX_DEFINITIONS = {
  deck_lists_user_creation_key_unique:
    "CREATE UNIQUE INDEX deck_lists_user_creation_key_unique ON public.deck_lists USING btree (user_id, creation_key) WHERE (creation_key IS NOT NULL)",
  deck_lists_user_updated:
    "CREATE INDEX deck_lists_user_updated ON public.deck_lists USING btree (user_id, updated_at DESC, id)",
  tournament_rounds_user_tournament:
    "CREATE INDEX tournament_rounds_user_tournament ON public.tournament_rounds USING btree (user_id, tournament_id)",
  tournaments_user_linked_deck:
    "CREATE INDEX tournaments_user_linked_deck ON public.tournaments USING btree (user_id, linked_deck_id) WHERE (linked_deck_id IS NOT NULL)"
};

const REQUIRED_INDEXES = [
  "decks_user_archetype",
  "deck_lists_user_creation_key_unique",
  "deck_lists_user_deck_position",
  "deck_lists_user_deck_updated",
  "deck_lists_user_updated",
  "deck_lists_deck_id",
  "deck_matchups_user_deck_position",
  "deck_matchups_user_deck_updated",
  "deck_matchups_deck_id",
  "deck_log_stats_pkey",
  "deck_log_stats_deck_id",
  "logs_user_date_imported_id",
  "logs_user_linked_deck_date",
  "logs_linked_deck_id",
  "log_shares_owner_created_at",
  "log_shares_owner_source_log",
  "route_performance_events_env_route_created_at",
  "route_performance_events_env_traffic_route_created_at",
  "tournament_rounds_user_tournament",
  "tournaments_user_linked_deck"
];

const REQUIRED_TRIGGERS = [
  "clear_orphaned_log_deck_list_link",
  "clear_orphaned_tournament_deck_list_link",
  "enforce_log_share_creation",
  "log_search_vector_update",
  "refresh_deck_log_stats_after_delete",
  "refresh_deck_log_stats_after_insert",
  "refresh_deck_log_stats_after_link_update",
  "refresh_user_log_stats_after_delete",
  "refresh_user_log_stats_after_insert",
  "refresh_user_log_stats_after_stats_update",
  "remove_deleted_deck_list_legacy_copy",
  "preserve_deleted_deck_references_before_delete",
  "set_decks_updated_at",
  "set_deck_lists_updated_at",
  "set_deck_matchups_updated_at",
  "refresh_user_archetype_matchup_stats_after_delete",
  "refresh_user_archetype_matchup_stats_after_insert",
  "refresh_user_archetype_matchup_stats_after_matchup_update"
];

function runSupabaseJson(sql) {
  const result = spawnSync(
    "supabase",
    ["--agent=no", "db", "query", ...target.args, "-o", "json", sql],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  if (result.status !== 0) {
    if (result.stdout.trim()) {
      process.stdout.write(target.redact(result.stdout));
    }
    if (result.stderr.trim()) {
      process.stderr.write(target.redact(result.stderr));
    }
    throw new Error("Supabase schema health query failed for the configured target.");
  }

  if (result.stderr.trim()) {
    process.stderr.write(target.redact(result.stderr));
  }

  const output = result.stdout.trim();
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");

  if (start < 0 || end < start) {
    throw new Error(`Could not parse Supabase JSON output: ${target.redact(output)}`);
  }

  try {
    return JSON.parse(output.slice(start, end + 1));
  } catch {
    throw new Error(`Could not parse Supabase JSON output: ${target.redact(output)}`);
  }
}

function sqlList(values) {
  return values.map((value) => `'${value.replaceAll("'", "''")}'`).join(",");
}

function reportMissing(label, missing) {
  if (missing.length === 0) {
    return [];
  }

  return [`${label}:`, ...missing.map((item) => `  - ${item}`)];
}

const tableNames = Object.keys(REQUIRED_COLUMNS);
const columnRows = runSupabaseJson(`
  select table_name, column_name
  from information_schema.columns
  where table_schema = 'public'
    and table_name in (${sqlList(tableNames)})
  order by table_name, ordinal_position;
`);
const functionRows = runSupabaseJson(`
  select routine_name
  from information_schema.routines
  where routine_schema = 'public'
    and routine_name in (${sqlList(REQUIRED_FUNCTIONS)})
  order by routine_name;
`);
const constraintRows = runSupabaseJson(`
  select conname, convalidated, pg_get_constraintdef(oid, true) as definition
  from pg_catalog.pg_constraint
  where connamespace = 'public'::regnamespace
    and conname in (${sqlList(REQUIRED_CONSTRAINTS)})
  order by conname;
`);
const indexRows = runSupabaseJson(`
  select indexname, indexdef
  from pg_indexes
  where schemaname = 'public'
    and indexname in (${sqlList(REQUIRED_INDEXES)})
  order by indexname;
`);
const triggerRows = runSupabaseJson(`
  select trigger_name
  from information_schema.triggers
  where trigger_schema = 'public'
    and trigger_name in (${sqlList(REQUIRED_TRIGGERS)})
  order by trigger_name;
`);
const [securityContract = {}] = runSupabaseJson(`
  select
    not has_table_privilege('anon', 'public.log_shares', 'SELECT')
      as anon_cannot_select_log_shares,
    not has_table_privilege('authenticated', 'public.log_shares', 'INSERT')
      as authenticated_cannot_insert_log_shares_directly,
    has_function_privilege('anon', 'public.get_active_log_share(text)', 'EXECUTE')
      as anon_can_use_token_scoped_share_reader,
    has_function_privilege(
      'authenticated',
      'public.create_log_share(text,text,jsonb)',
      'EXECUTE'
    ) as authenticated_can_use_rate_limited_share_creator,
    has_function_privilege(
      'authenticated',
      'public.revoke_log_share(text)',
      'EXECUTE'
    ) as authenticated_can_use_atomic_share_revoker,
    not has_function_privilege('anon', 'public.revoke_log_share(text)', 'EXECUTE')
      as anon_cannot_revoke_log_shares,
    coalesce((
      select position('pg_advisory_xact_lock' in pg_catalog.pg_get_functiondef(procedure.oid)) > 0
        and position('owner_user_id = current_user_id' in pg_catalog.pg_get_functiondef(procedure.oid)) > 0
        and position('source_log_id = p_source_log_id' in pg_catalog.pg_get_functiondef(procedure.oid)) > 0
      from pg_catalog.pg_proc as procedure
      where procedure.oid = pg_catalog.to_regprocedure(
        'public.create_log_share(text,text,jsonb)'
      )
    ), false) as share_creator_is_owner_source_atomic,
    coalesce((
      select position('pg_advisory_xact_lock' in pg_catalog.pg_get_functiondef(procedure.oid)) > 0
        and position('owner_user_id = current_user_id' in pg_catalog.pg_get_functiondef(procedure.oid)) > 0
        and position('source_log_id = target_source_log_id' in pg_catalog.pg_get_functiondef(procedure.oid)) > 0
      from pg_catalog.pg_proc as procedure
      where procedure.oid = pg_catalog.to_regprocedure(
        'public.revoke_log_share(text)'
      )
    ), false) as share_revoker_is_owner_source_atomic,
    coalesce((
      select position('LOG_SHARE_PAYLOAD_TOO_LARGE' in pg_catalog.pg_get_functiondef(procedure.oid)) > 0
        and position('262144' in pg_catalog.pg_get_functiondef(procedure.oid)) > 0
      from pg_catalog.pg_proc as procedure
      where procedure.oid = pg_catalog.to_regprocedure(
        'public.create_log_share(text,text,jsonb)'
      )
    ), false) as share_creator_has_stable_payload_limit,
    coalesce((
      select relation.relrowsecurity
        and not pg_catalog.has_table_privilege(
          'authenticated',
          relation.oid,
          'SELECT,INSERT,UPDATE,DELETE'
        )
        and not pg_catalog.has_table_privilege(
          'service_role',
          relation.oid,
          'SELECT,INSERT,UPDATE,DELETE'
        )
      from pg_catalog.pg_class as relation
      where relation.oid = pg_catalog.to_regclass(
        'private.deck_aggregate_rekey_ledger'
      )
    ), false) as private_rekey_ledger_is_locked,
    coalesce(has_function_privilege(
      'authenticated',
      pg_catalog.to_regprocedure(
        'public.commit_deck_aggregate_child(text,text,text,jsonb,text,timestamptz)'
      ),
      'EXECUTE'
    ), false) as authenticated_can_commit_deck_aggregates,
    coalesce(not has_function_privilege(
      'anon',
      pg_catalog.to_regprocedure(
        'public.commit_deck_aggregate_child(text,text,text,jsonb,text,timestamptz)'
      ),
      'EXECUTE'
    ), false) as anon_cannot_commit_deck_aggregates,
    coalesce((
      select
        procedure.prosecdef
        and procedure.proconfig @> array['search_path=pg_catalog, public']::text[]
      from pg_catalog.pg_proc as procedure
      where procedure.oid = pg_catalog.to_regprocedure(
        'public.commit_deck_aggregate_child(text,text,text,jsonb,text,timestamptz)'
      )
    ), false) as deck_aggregate_commit_is_definer_with_fixed_search_path,
    coalesce(
      has_function_privilege(
        'authenticated',
        pg_catalog.to_regprocedure(
          'public.commit_first_class_deck_list(text,text,jsonb,text,timestamptz,timestamptz)'
        ),
        'EXECUTE'
      )
      and has_function_privilege(
        'authenticated',
        pg_catalog.to_regprocedure(
          'public.set_deck_list_association(text,text,timestamptz,timestamptz)'
        ),
        'EXECUTE'
      )
      and has_function_privilege(
        'authenticated',
        pg_catalog.to_regprocedure(
          'public.delete_first_class_deck_list(text,timestamptz)'
        ),
        'EXECUTE'
      )
      and not has_function_privilege(
        'anon',
        pg_catalog.to_regprocedure(
          'public.commit_first_class_deck_list(text,text,jsonb,text,timestamptz,timestamptz)'
        ),
        'EXECUTE'
      )
      and not has_function_privilege(
        'anon',
        pg_catalog.to_regprocedure(
          'public.set_deck_list_association(text,text,timestamptz,timestamptz)'
        ),
        'EXECUTE'
      )
      and not has_function_privilege(
        'anon',
        pg_catalog.to_regprocedure(
          'public.delete_first_class_deck_list(text,timestamptz)'
        ),
        'EXECUTE'
      ),
      false
    ) as first_class_deck_list_rpcs_are_callable,
    has_table_privilege('authenticated', 'public.decks', 'DELETE')
      as authenticated_can_delete_decks,
    coalesce((
      select procedure.prosecdef
        and procedure.proconfig @> array['search_path=pg_catalog, public']::text[]
        and position('pg_try_advisory_xact_lock' in pg_catalog.pg_get_functiondef(procedure.oid)) > 0
        and position('preserve_deleted_deck_legacy_references' in pg_catalog.pg_get_functiondef(procedure.oid)) > 0
      from pg_catalog.pg_proc as procedure
      where procedure.oid = pg_catalog.to_regprocedure(
        'public.preserve_deleted_deck_references_before_delete()'
      )
    ), false) as direct_deck_delete_preservation_is_safe,
    coalesce((
      select not has_function_privilege('anon', procedure.oid, 'EXECUTE')
        and not has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
      from pg_catalog.pg_proc as procedure
      where procedure.oid = pg_catalog.to_regprocedure(
        'public.preserve_deleted_deck_references_before_delete()'
      )
    ), false) as direct_deck_delete_trigger_is_not_callable,
    coalesce((
      select position('deck_list.user_id = p_user_id' in pg_catalog.pg_get_functiondef(procedure.oid)) > 0
        and position('deck_list.id = p_deck_list_id' in pg_catalog.pg_get_functiondef(procedure.oid)) > 0
        and position('item.value ->> ''id'' = p_deck_list_id' in pg_catalog.pg_get_functiondef(procedure.oid)) > 0
      from pg_catalog.pg_proc as procedure
      where procedure.oid = pg_catalog.to_regprocedure(
        'public.can_use_deck_list_reference(uuid,text,text)'
      )
    ), false) as deck_list_reference_is_account_scoped,
    coalesce((
      select position('returning * into v_list' in lower(pg_catalog.pg_get_functiondef(procedure.oid))) > 0
        and position('''updatedat'', v_list.updated_at' in lower(pg_catalog.pg_get_functiondef(procedure.oid))) > 0
      from pg_catalog.pg_proc as procedure
      where procedure.oid = pg_catalog.to_regprocedure(
        'public.set_deck_list_association(text,text,timestamptz,timestamptz)'
      )
    ), false) as association_uses_authoritative_timestamp,
    not has_column_privilege('authenticated', 'public.profiles', 'role', 'INSERT')
      as authenticated_cannot_insert_profile_role,
    not has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE')
      as authenticated_cannot_update_profile_role,
    not has_table_privilege('authenticated', 'public.profiles', 'INSERT')
      as authenticated_cannot_insert_profiles_directly,
    not has_column_privilege('authenticated', 'public.profiles', 'email', 'UPDATE')
      as authenticated_cannot_update_profile_email,
    has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE')
      as authenticated_can_update_profile_display_name,
    has_column_privilege('authenticated', 'public.profiles', 'first_name', 'UPDATE')
      as authenticated_can_update_profile_first_name,
    has_column_privilege('authenticated', 'public.profiles', 'last_name', 'UPDATE')
      as authenticated_can_update_profile_last_name,
    has_column_privilege('authenticated', 'public.profiles', 'ptcgl_username', 'UPDATE')
      as authenticated_can_update_profile_ptcgl_username,
    has_column_privilege('authenticated', 'public.profiles', 'avatar_color', 'UPDATE')
      as authenticated_can_update_profile_avatar,
    not has_function_privilege('anon', 'public.get_admin_dashboard_overview()', 'EXECUTE')
      as anon_cannot_execute_admin_dashboard,
    not has_function_privilege('anon', 'public.get_admin_users_overview()', 'EXECUTE')
      as anon_cannot_execute_admin_users,
    not has_function_privilege(
      'authenticated',
      'public.set_profile_role(uuid,uuid,text)',
      'EXECUTE'
    ) as authenticated_cannot_execute_role_mutation,
    has_function_privilege(
      'service_role',
      'public.set_profile_role(uuid,uuid,text)',
      'EXECUTE'
    ) as service_role_can_execute_role_mutation,
    not has_function_privilege('anon', 'public.rls_auto_enable()', 'EXECUTE')
      as anon_cannot_execute_rls_event_trigger,
    not has_function_privilege('authenticated', 'public.rls_auto_enable()', 'EXECUTE')
      as authenticated_cannot_execute_rls_event_trigger,
    (
      not has_function_privilege(
        'anon',
        'public.clear_orphaned_deck_list_link()',
        'EXECUTE'
      )
      and not has_function_privilege(
        'authenticated',
        'public.clear_orphaned_deck_list_link()',
        'EXECUTE'
      )
    ) as link_cleanup_trigger_is_not_directly_executable,
    coalesce((
      select p.proconfig @> array['search_path=pg_catalog']::text[]
      from pg_proc as p
      join pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'set_updated_at'
    ), false) as updated_at_trigger_has_fixed_search_path,
    coalesce((
      select p.proconfig @> array['search_path=pg_catalog']::text[]
      from pg_proc as p
      join pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'update_log_search_vector'
    ), false) as search_vector_trigger_has_fixed_search_path,
    not exists (
      select 1
      from pg_policies as policy
      where policy.schemaname = 'public'
        and concat(
          replace(coalesce(policy.qual, ''), '( SELECT auth.uid() AS uid)', ''),
          replace(coalesce(policy.with_check, ''), '( SELECT auth.uid() AS uid)', '')
        ) like '%auth.uid()%'
    ) as rls_identity_checks_are_initplan_safe,
    (
      select count(*) = 4
      from pg_policies as policy
      where policy.schemaname = 'public'
        and (policy.tablename, policy.policyname) in (
          ('decks', 'Users can update own decks'),
          ('logs', 'Users can update own logs'),
          ('tournament_rounds', 'Users can update own tournament rounds'),
          ('tournaments', 'Users can update own tournaments')
        )
        and policy.with_check is not null
    ) as owner_updates_recheck_identity,
    (
      select count(*) = 1
      from pg_policies as policy
      where policy.schemaname = 'public'
        and policy.tablename = 'route_performance_events'
        and policy.cmd = 'SELECT'
    ) as route_performance_has_single_select_policy,
    (
      select count(*) = 4
      from pg_policies as policy
      where policy.schemaname = 'public'
        and (policy.tablename, policy.policyname) in (
          ('logs', 'Users can insert own logs'),
          ('logs', 'Users can update own logs'),
          ('tournaments', 'Users can insert own tournaments'),
          ('tournaments', 'Users can update own tournaments')
        )
        and position('auth.uid' in lower(coalesce(policy.with_check, ''))) > 0
        and position('can_use_deck_list_reference' in lower(coalesce(policy.with_check, ''))) > 0
    ) as linked_deck_list_writes_require_owned_parent,
    not exists (
      select 1
      from pg_catalog.pg_constraint
      where connamespace = 'public'::regnamespace
        and conname in (
          'deck_lists_deck_id_fkey',
          'deck_matchups_deck_id_fkey',
          'tournament_rounds_tournament_id_fkey',
          'deck_log_stats_deck_id_fkey',
          'logs_linked_deck_id_fkey',
          'tournaments_linked_deck_id_fkey'
        )
    ) as superseded_id_only_parent_keys_are_absent,
    not exists (
      select 1
      from pg_catalog.pg_constraint
      where connamespace = 'public'::regnamespace
        and conname in (
          'logs_linked_deck_list_requires_deck',
          'tournaments_linked_deck_list_requires_deck'
        )
    ) as optional_deck_links_are_coherent,
    (
      select count(*) = 2
      from pg_catalog.pg_trigger as trigger
      join pg_catalog.pg_class as relation on relation.oid = trigger.tgrelid
      join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
      join pg_catalog.pg_proc as procedure on procedure.oid = trigger.tgfoid
      where namespace.nspname = 'public'
        and relation.relname in ('logs', 'tournaments')
        and trigger.tgname in (
          'clear_orphaned_log_deck_list_link',
          'clear_orphaned_tournament_deck_list_link'
        )
        and procedure.proname = 'clear_orphaned_deck_list_link'
        and trigger.tgtype = 23
        and trigger.tgenabled = 'O'
    ) as optional_deck_link_cleanup_triggers_are_active,
    not exists (
      select 1
      from pg_catalog.pg_default_acl as default_acl
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = default_acl.defaclnamespace
      cross join lateral pg_catalog.aclexplode(default_acl.defaclacl) as privilege
      where pg_catalog.pg_get_userbyid(default_acl.defaclrole) = 'postgres'
        and namespace.nspname = 'public'
        and default_acl.defaclobjtype = 'r'
        and pg_catalog.pg_get_userbyid(privilege.grantee) in (
          'anon',
          'authenticated',
          'service_role'
        )
    ) as future_public_tables_require_explicit_grants,
    not exists (
      select 1
      from pg_catalog.pg_default_acl as default_acl
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = default_acl.defaclnamespace
      cross join lateral pg_catalog.aclexplode(default_acl.defaclacl) as privilege
      where pg_catalog.pg_get_userbyid(default_acl.defaclrole) = 'postgres'
        and namespace.nspname = 'public'
        and default_acl.defaclobjtype = 'S'
        and pg_catalog.pg_get_userbyid(privilege.grantee) in (
          'anon',
          'authenticated',
          'service_role'
        )
    ) as future_public_sequences_require_explicit_grants,
    not exists (
      select 1
      from pg_catalog.pg_default_acl as default_acl
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = default_acl.defaclnamespace
      cross join lateral pg_catalog.aclexplode(default_acl.defaclacl) as privilege
      where pg_catalog.pg_get_userbyid(default_acl.defaclrole) = 'postgres'
        and namespace.nspname = 'public'
        and default_acl.defaclobjtype = 'f'
        and pg_catalog.pg_get_userbyid(privilege.grantee) in (
          'anon',
          'authenticated',
          'service_role'
        )
    ) as future_public_functions_require_explicit_grants,
    exists (
      select 1
      from pg_catalog.pg_event_trigger as event_trigger
      join pg_catalog.pg_proc as procedure
        on procedure.oid = event_trigger.evtfoid
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = procedure.pronamespace
      where event_trigger.evtname = 'pokenotes_harden_public_routine_privileges'
        and event_trigger.evtevent = 'ddl_command_end'
        and event_trigger.evtenabled = 'O'
        and event_trigger.evttags @> array[
          'CREATE FUNCTION',
          'CREATE PROCEDURE',
          'CREATE AGGREGATE'
        ]::text[]
        and pg_catalog.cardinality(event_trigger.evttags) = 3
        and namespace.nspname = 'private'
        and procedure.proname = 'harden_new_public_routine_privileges'
    ) as future_public_routine_hardener_is_active,
    coalesce((
      select
        procedure.prosecdef
        and procedure.proconfig = array['search_path=""']::text[]
        and not pg_catalog.has_function_privilege(
          'anon', procedure.oid, 'EXECUTE'
        )
        and not pg_catalog.has_function_privilege(
          'authenticated', procedure.oid, 'EXECUTE'
        )
        and not pg_catalog.has_function_privilege(
          'service_role', procedure.oid, 'EXECUTE'
        )
        and position(
          'command.schema_name = ''public'''
          in lower(pg_catalog.pg_get_functiondef(procedure.oid))
        ) > 0
        and position(
          'not command.in_extension'
          in lower(pg_catalog.pg_get_functiondef(procedure.oid))
        ) > 0
        and position(
          'routine.proowner = ''postgres''::regrole'
          in lower(pg_catalog.pg_get_functiondef(procedure.oid))
        ) > 0
        and position(
          'revoke execute on routine'
          in lower(pg_catalog.pg_get_functiondef(procedure.oid))
        ) > 0
      from pg_catalog.pg_proc as procedure
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'private'
        and procedure.proname = 'harden_new_public_routine_privileges'
        and procedure.prorettype = 'event_trigger'::regtype
    ), false) as future_public_routine_hardener_is_scoped_and_locked_down,
    (
      not exists (
        select 1
        from pg_catalog.pg_class as relation
        join pg_catalog.pg_namespace as namespace
          on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
          and pg_catalog.pg_get_userbyid(relation.relowner) <> 'postgres'
      )
      and not exists (
        select 1
        from pg_catalog.pg_proc as procedure
        join pg_catalog.pg_namespace as namespace
          on namespace.oid = procedure.pronamespace
        where namespace.nspname = 'public'
          and pg_catalog.pg_get_userbyid(procedure.proowner) <> 'postgres'
      )
    ) as public_objects_use_the_hardened_creator_role;
`);

const columnsByTable = new Map();
for (const row of columnRows) {
  const tableName = String(row.table_name || "");
  const columnName = String(row.column_name || "");
  if (!columnsByTable.has(tableName)) {
    columnsByTable.set(tableName, new Set());
  }
  columnsByTable.get(tableName).add(columnName);
}

const missingColumns = [];
for (const [tableName, columns] of Object.entries(REQUIRED_COLUMNS)) {
  const actualColumns = columnsByTable.get(tableName) ?? new Set();
  for (const column of columns) {
    if (!actualColumns.has(column)) {
      missingColumns.push(`${tableName}.${column}`);
    }
  }
}

const actualFunctions = new Set(functionRows.map((row) => String(row.routine_name || "")));
const actualConstraints = new Map(
  constraintRows.map((row) => [
    String(row.conname || ""),
    {
      definition: String(row.definition || ""),
      validated: row.convalidated === true
    }
  ])
);
const actualIndexes = new Map(
  indexRows.map((row) => [String(row.indexname || ""), String(row.indexdef || "")])
);
const actualTriggers = new Set(triggerRows.map((row) => String(row.trigger_name || "")));
const missingFunctions = REQUIRED_FUNCTIONS.filter((name) => !actualFunctions.has(name));
const missingConstraints = REQUIRED_CONSTRAINTS.filter(
  (name) =>
    actualConstraints.get(name)?.validated !== true ||
    actualConstraints.get(name)?.definition !== REQUIRED_CONSTRAINT_DEFINITIONS[name]
);
const missingIndexes = REQUIRED_INDEXES.filter((name) => !actualIndexes.has(name));
const changedIndexes = Object.entries(REQUIRED_INDEX_DEFINITIONS)
  .filter(([name, definition]) => actualIndexes.get(name) !== definition)
  .map(([name]) => name);
const missingTriggers = REQUIRED_TRIGGERS.filter((name) => !actualTriggers.has(name));
const failures = [
  ...reportMissing("Missing columns", missingColumns),
  ...reportMissing("Missing functions", missingFunctions),
  ...reportMissing("Missing, unvalidated, or changed constraints", missingConstraints),
  ...reportMissing("Missing indexes", missingIndexes),
  ...reportMissing("Indexes with changed definitions", changedIndexes),
  ...reportMissing("Missing triggers", missingTriggers)
];

const failedSecurityContracts = Object.entries(securityContract)
  .filter(([, passed]) => passed !== true)
  .map(([name]) => name);
failures.push(...reportMissing("Failed security contracts", failedSecurityContracts));

if (failures.length > 0) {
  console.error("Schema health check failed.");
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Schema health check passed.");
console.log(`Tables checked: ${tableNames.length}`);
console.log(`Columns checked: ${Object.values(REQUIRED_COLUMNS).flat().length}`);
console.log(`Functions checked: ${REQUIRED_FUNCTIONS.length}`);
console.log(`Constraints checked: ${REQUIRED_CONSTRAINTS.length}`);
console.log(`Indexes checked: ${REQUIRED_INDEXES.length}`);
console.log(`Triggers checked: ${REQUIRED_TRIGGERS.length}`);
console.log(`Security contracts checked: ${Object.keys(securityContract).length}`);
