#!/usr/bin/env node

import { spawnSync } from "node:child_process";

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
    "date_from",
    "date_to",
    "linked_deck_id",
    "linked_deck_list_id",
    "deck_name",
    "deck_sprites",
    "category",
    "placement",
    "format",
    "notes",
    "created_at",
    "updated_at"
  ]
};

const REQUIRED_FUNCTIONS = [
  "get_admin_dashboard_overview",
  "get_admin_users_overview",
  "get_archetype_matchup_key",
  "get_deck_index",
  "get_deck_index_stats",
  "get_log_stats_overview",
  "refresh_deck_log_stats",
  "refresh_user_archetype_matchup_stats",
  "refresh_user_log_stats",
  "sync_deck_log_stats_from_log_row",
  "sync_user_archetype_matchup_stats_from_log_row",
  "sync_user_log_stats_from_log_row"
];

const REQUIRED_INDEXES = [
  "decks_user_archetype",
  "deck_lists_user_deck_position",
  "deck_lists_user_deck_updated",
  "deck_matchups_user_deck_position",
  "deck_matchups_user_deck_updated",
  "deck_log_stats_pkey",
  "logs_user_date_imported_id",
  "logs_user_linked_deck_date",
  "log_shares_owner_source_log",
  "route_performance_events_env_route_created_at"
];

const REQUIRED_TRIGGERS = [
  "log_search_vector_update",
  "refresh_deck_log_stats_after_delete",
  "refresh_deck_log_stats_after_insert",
  "refresh_deck_log_stats_after_link_update",
  "refresh_user_log_stats_after_delete",
  "refresh_user_log_stats_after_insert",
  "refresh_user_log_stats_after_stats_update",
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
    ["--agent=no", "db", "query", "--linked", "-o", "json", sql],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  if (result.status !== 0) {
    if (result.stdout.trim()) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr.trim()) {
      process.stderr.write(result.stderr);
    }
    throw new Error("Supabase linked query failed.");
  }

  if (result.stderr.trim()) {
    process.stderr.write(result.stderr);
  }

  const output = result.stdout.trim();
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");

  if (start < 0 || end < start) {
    throw new Error(`Could not parse Supabase JSON output: ${output}`);
  }

  return JSON.parse(output.slice(start, end + 1));
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
const indexRows = runSupabaseJson(`
  select indexname
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
const actualIndexes = new Set(indexRows.map((row) => String(row.indexname || "")));
const actualTriggers = new Set(triggerRows.map((row) => String(row.trigger_name || "")));
const missingFunctions = REQUIRED_FUNCTIONS.filter((name) => !actualFunctions.has(name));
const missingIndexes = REQUIRED_INDEXES.filter((name) => !actualIndexes.has(name));
const missingTriggers = REQUIRED_TRIGGERS.filter((name) => !actualTriggers.has(name));
const failures = [
  ...reportMissing("Missing columns", missingColumns),
  ...reportMissing("Missing functions", missingFunctions),
  ...reportMissing("Missing indexes", missingIndexes),
  ...reportMissing("Missing triggers", missingTriggers)
];

if (failures.length > 0) {
  console.error("Schema health check failed.");
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Schema health check passed.");
console.log(`Tables checked: ${tableNames.length}`);
console.log(`Columns checked: ${Object.values(REQUIRED_COLUMNS).flat().length}`);
console.log(`Functions checked: ${REQUIRED_FUNCTIONS.length}`);
console.log(`Indexes checked: ${REQUIRED_INDEXES.length}`);
console.log(`Triggers checked: ${REQUIRED_TRIGGERS.length}`);
