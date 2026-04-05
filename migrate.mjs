import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const REQUIRED_ENV_VARS = [
  "OLD_SUPABASE_URL",
  "OLD_SUPABASE_SERVICE_KEY",
  "NEW_SUPABASE_URL",
  "NEW_SUPABASE_SERVICE_KEY",
];

const BATCH_SIZE = 50;

for (const envVar of REQUIRED_ENV_VARS) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

const oldSupabase = createClient(
  process.env.OLD_SUPABASE_URL,
  process.env.OLD_SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

const newSupabase = createClient(
  process.env.NEW_SUPABASE_URL,
  process.env.NEW_SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

const oldProjectRef = new URL(process.env.OLD_SUPABASE_URL).hostname.split(".")[0];
const newProjectRef = new URL(process.env.NEW_SUPABASE_URL).hostname.split(".")[0];

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeNullable(value) {
  return value === undefined ? null : value;
}

function normalizeNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function mapGoPreference(value) {
  if (value === "Go First") return "First";
  if (value === "Go Second") return "Second";
  return "";
}

function buildDeckLists(deckLists) {
  return safeArray(deckLists).map((entry) => {
    const item = safeObject(entry);
    return {
      ...item,
      parsedCards: safeArray(item.parsedCards),
    };
  });
}

function findSelfAndOpponent(logId, payload) {
  const payloadResult = normalizeString(payload.result);
  const players = safeArray(payload.players);
  const selfPlayer = players.find(
    (player) => safeObject(player).result === payloadResult,
  );

  if (!selfPlayer) {
    throw new Error(
      `could not identify self player from payload.players for result "${payloadResult}"`,
    );
  }

  const opponentPlayer =
    players.find((player) => safeObject(player).name !== safeObject(selfPlayer).name) ?? null;

  if (!opponentPlayer) {
    throw new Error(`could not identify opponent player for log ${logId}`);
  }

  return {
    selfPlayer: safeObject(selfPlayer),
    opponentPlayer: safeObject(opponentPlayer),
  };
}

function buildPlayerStatsMap(payloadStats) {
  const statsPlayers = safeArray(payloadStats.players);
  const statsMap = new Map();

  for (const playerStats of statsPlayers) {
    const entry = safeObject(playerStats);
    const playerName = normalizeString(entry.name);
    if (playerName) {
      statsMap.set(playerName, entry);
    }
  }

  return statsMap;
}

function determineGoOrder(selfPlayerName, sections) {
  const firstSection = safeArray(sections)[0];
  const actions = safeArray(safeObject(firstSection).actions);

  for (const action of actions) {
    const line = normalizeString(action?.title).toLowerCase();
    if (!line) continue;

    const selfMentioned = selfPlayerName
      ? line.includes(selfPlayerName.toLowerCase())
      : false;

    if (!selfMentioned) continue;
    if (line.includes("decided to go first")) return "First";
    if (line.includes("decided to go second")) return "Second";
  }

  return "";
}

function transformProfileRow(row) {
  return {
    id: row.id,
    display_name: row.display_name,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    ptcgl_username: row.ptcgl_username,
    role: row.role,
    avatar_color: row.avatar_color,
    auth_account_created_at: row.auth_account_created_at,
    last_login_at: row.last_login_at,
    last_active_at: row.last_active_at,
    login_count: row.login_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function transformDeckRow(row) {
  const payload = safeObject(row.payload);
  return {
    id: payload.id ?? row.id,
    user_id: row.user_id,
    deck_name: normalizeString(payload.deckName),
    format: normalizeString(payload.format),
    go_preference: mapGoPreference(payload.turnPreference),
    deck_pokemon: safeArray(payload.deckPokemon),
    core_strategy: normalizeString(payload.coreStrategy),
    general_notes: normalizeString(payload.generalNotes),
    setup_goals: safeArray(payload.setupGoals),
    resource_plan: normalizeString(payload.resourceManagement),
    deck_lists: buildDeckLists(payload.deckLists),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function transformLogRow(row) {
  const payload = safeObject(row.payload);
  const payloadResult = normalizeString(payload.result);

  if (payloadResult !== "Win" && payloadResult !== "Loss") {
    throw new Error(`invalid result "${payloadResult}"`);
  }

  const { selfPlayer, opponentPlayer } = findSelfAndOpponent(row.id, payload);
  const payloadStats = safeObject(payload.stats);
  const statsMap = buildPlayerStatsMap(payloadStats);
  const selfPlayerName = normalizeString(selfPlayer.name);
  const opponentPlayerName = normalizeString(opponentPlayer.name);
  const selfStats = safeObject(statsMap.get(selfPlayerName));
  const opponentStats = safeObject(statsMap.get(opponentPlayerName));
  const coinTossWinner = normalizeString(payloadStats.coinTossWinner);

  let coinTossWon = null;
  if (coinTossWinner) {
    coinTossWon = coinTossWinner === selfPlayerName;
  }

  const sections = safeArray(payload.sections);

  return {
    id: payload.id ?? row.id,
    user_id: row.user_id,
    date: normalizeString(payload.date) || String(row.created_at).slice(0, 10),
    result: payloadResult,
    format: normalizeString(payload.format),
    go_order: determineGoOrder(selfPlayerName, sections),
    self_player_name: selfPlayerName,
    self_deck_name: normalizeString(selfPlayer.deckName),
    self_deck_slug: normalizeString(selfPlayer.deckSlug),
    self_deck_sprites: normalizeString(selfPlayer.deckSprites),
    opponent_player_name: opponentPlayerName,
    opponent_deck_name: normalizeString(opponentPlayer.deckName),
    opponent_deck_slug: normalizeString(opponentPlayer.deckSlug),
    opponent_deck_sprites: normalizeString(opponentPlayer.deckSprites),
    total_turns: normalizeNumber(payloadStats.totalTurns),
    coin_toss_won: coinTossWon,
    self_prizes_taken: normalizeNumber(selfStats.prizesTaken),
    opponent_prizes_taken: normalizeNumber(opponentStats.prizesTaken),
    self_attack_damage: normalizeNumber(selfStats.attackDamage),
    opponent_attack_damage: normalizeNumber(opponentStats.attackDamage),
    self_mulligans: normalizeNumber(selfStats.mulligans),
    opponent_mulligans: normalizeNumber(opponentStats.mulligans),
    linked_deck_id: null,
    linked_deck_list_id: null,
    reason: normalizeString(payload.reason),
    raw_log: normalizeString(payload.rawLog),
    sections,
    imported_at: payload.importedAt ?? row.created_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function fetchBatch(table, from) {
  const to = from + BATCH_SIZE - 1;
  const { data, error } = await oldSupabase
    .from(table)
    .select("*")
    .order("id", { ascending: true })
    .range(from, to);

  if (error) {
    throw new Error(`failed to fetch ${table} rows ${from}-${to}: ${error.message}`);
  }

  return data ?? [];
}

async function fetchAuthUsersBatch(page) {
  const url = new URL(
    `https://${oldProjectRef}.supabase.co/auth/v1/admin/users`,
  );
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(BATCH_SIZE));

  const response = await fetch(url, {
    headers: {
      apikey: process.env.OLD_SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${process.env.OLD_SUPABASE_SERVICE_KEY}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`failed to fetch auth users page ${page}: ${response.status} ${body}`);
  }

  const data = await response.json();
  return safeArray(data.users);
}

async function createAuthUser(user) {
  const response = await fetch(
    `https://${newProjectRef}.supabase.co/auth/v1/admin/users`,
    {
      method: "POST",
      headers: {
        apikey: process.env.NEW_SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${process.env.NEW_SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        user_metadata: user.user_metadata,
        app_metadata: user.app_metadata,
        email_confirm: true,
        id: user.id,
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`failed to create auth user: ${response.status} ${body}`);
  }
}

async function migrateTable({ sourceTable, targetTable, transform, summary }) {
  let offset = 0;

  while (true) {
    const rows = await fetchBatch(sourceTable, offset);
    if (rows.length === 0) break;

    console.log(
      `[${sourceTable}] fetched batch starting at offset ${offset} (${rows.length} rows)`,
    );

    for (const row of rows) {
      const recordId = row.id ?? safeObject(row.payload).id ?? "unknown";
      console.log(`[${sourceTable}] processing record ${recordId}`);

      try {
        const transformed = transform(row);
        const { error } = await newSupabase
          .from(targetTable)
          .upsert(transformed, { onConflict: "id" });

        if (error) {
          throw new Error(error.message);
        }

        summary.succeeded += 1;
        console.log(`[${sourceTable}] succeeded for record ${recordId}`);
      } catch (error) {
        summary.failed += 1;
        console.error(
          `[${sourceTable}] failed for record ${recordId}: ${error.message}`,
        );
      }
    }

    offset += rows.length;

    if (rows.length < BATCH_SIZE) {
      break;
    }
  }
}

async function migrateAuthUsers(summary) {
  let page = 1;

  while (true) {
    const users = await fetchAuthUsersBatch(page);
    if (users.length === 0) break;

    console.log(
      `[authUsers] fetched batch for page ${page} (${users.length} users)`,
    );

    for (const user of users) {
      const recordId = user.id ?? "unknown";
      console.log(`[authUsers] processing record ${recordId}`);

      try {
        await createAuthUser(user);
        summary.succeeded += 1;
        console.log(`[authUsers] succeeded for record ${recordId}`);
      } catch (error) {
        summary.failed += 1;
        console.error(
          `[authUsers] failed for record ${recordId}: ${error.message}`,
        );
      }
    }

    if (users.length < BATCH_SIZE) {
      break;
    }

    page += 1;
  }
}

async function main() {
  const summary = {
    authUsers: { succeeded: 0, failed: 0 },
    profiles: { succeeded: 0, failed: 0 },
    decks: { succeeded: 0, failed: 0 },
    logs: { succeeded: 0, failed: 0 },
  };

  console.log("Starting auth users migration...");
  await migrateAuthUsers(summary.authUsers);

  console.log("Starting profiles migration...");
  await migrateTable({
    sourceTable: "profiles",
    targetTable: "profiles",
    transform: transformProfileRow,
    summary: summary.profiles,
  });

  console.log("Starting decks migration...");
  await migrateTable({
    sourceTable: "decks",
    targetTable: "decks",
    transform: transformDeckRow,
    summary: summary.decks,
  });

  console.log("Starting logs migration...");
  await migrateTable({
    sourceTable: "logs",
    targetTable: "logs",
    transform: transformLogRow,
    summary: summary.logs,
  });

  console.log("");
  console.log("Migration summary:");
  console.log(
    `authUsers: ${summary.authUsers.succeeded} succeeded, ${summary.authUsers.failed} failed`,
  );
  console.log(
    `profiles: ${summary.profiles.succeeded} succeeded, ${summary.profiles.failed} failed`,
  );
  console.log(
    `decks: ${summary.decks.succeeded} succeeded, ${summary.decks.failed} failed`,
  );
  console.log(
    `logs: ${summary.logs.succeeded} succeeded, ${summary.logs.failed} failed`,
  );
}

main().catch((error) => {
  console.error(`Migration aborted: ${error.message}`);
  process.exit(1);
});
