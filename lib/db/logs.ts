import { cache } from "react";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { measureServerCall } from "@/lib/server/perf";
import { resolveLinkedDeck } from "@/lib/log-import/deck-linking";
import type { DeckLinkCandidate } from "@/lib/log-import/deck-linking";
import type { BattleLog, BattleLogSummary, LogSection, Result } from "@/types/index";

export const logsDbTestHooks = {
  createClient: createSupabaseClient
};

const DEFAULT_LOG_WINDOW_DAYS = 7;
const DEFAULT_LOG_WINDOW_LIMIT = 50;

export type LogSummaryStats = {
  total: number;
  wins: number;
  losses: number;
};

type LogSummaryStatsRow = {
  games_played: number | null;
  games_won: number | null;
  games_lost: number | null;
};

type DeckLogStatsReadModelRow = {
  deck_id: string | null;
  games_played: number | null;
  games_won: number | null;
  games_lost: number | null;
};

export type DeckLogSnapshot = {
  logs: BattleLogSummary[];
  stats: LogSummaryStats;
};

export type LogStatsOverview = {
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  attackDamage: number;
  opponentAttackDamage: number;
  coinFlipsWon: number;
  mulligansTaken: number;
  prizesTaken: number;
  trackedDamage: number;
  trackedPrizes: number;
};

export type ArchetypeMatchupStats = {
  matchupKey: string;
  opponentDeckName: string;
  opponentDeckSprites: string[];
  sourceDeckSlugs: string[];
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  lastPlayedDate: string | null;
  winRate: number | null;
};

type LogStatsOverviewRpcRow = {
  games_played: number | null;
  games_won: number | null;
  games_lost: number | null;
  attack_damage: number | null;
  opponent_attack_damage: number | null;
  coin_flips_won: number | null;
  mulligans_taken: number | null;
  prizes_taken: number | null;
  tracked_damage: number | null;
  tracked_prizes: number | null;
};

type ArchetypeMatchupStatsRow = {
  matchup_key: string | null;
  opponent_deck_name: string | null;
  opponent_deck_sprites: string | null;
  source_deck_slugs: string | null;
  games_played: number | null;
  games_won: number | null;
  games_lost: number | null;
  last_played_date: string | null;
};

function mapLogStatsOverviewRow(row: LogStatsOverviewRpcRow | null): LogStatsOverview {
  return {
    gamesPlayed: Number(row?.games_played ?? 0),
    gamesWon: Number(row?.games_won ?? 0),
    gamesLost: Number(row?.games_lost ?? 0),
    attackDamage: Number(row?.attack_damage ?? 0),
    opponentAttackDamage: Number(row?.opponent_attack_damage ?? 0),
    coinFlipsWon: Number(row?.coin_flips_won ?? 0),
    mulligansTaken: Number(row?.mulligans_taken ?? 0),
    prizesTaken: Number(row?.prizes_taken ?? 0),
    trackedDamage: Number(row?.tracked_damage ?? 0),
    trackedPrizes: Number(row?.tracked_prizes ?? 0)
  };
}

function mapArchetypeMatchupStatsRow(row: ArchetypeMatchupStatsRow): ArchetypeMatchupStats {
  const gamesPlayed = Number(row.games_played ?? 0);
  const gamesWon = Number(row.games_won ?? 0);

  return {
    matchupKey: String(row.matchup_key ?? ""),
    opponentDeckName: String(row.opponent_deck_name ?? ""),
    opponentDeckSprites: splitSprites(String(row.opponent_deck_sprites ?? "")),
    sourceDeckSlugs: splitSprites(String(row.source_deck_slugs ?? "")),
    gamesPlayed,
    gamesWon,
    gamesLost: Number(row.games_lost ?? 0),
    lastPlayedDate: row.last_played_date ? String(row.last_played_date) : null,
    winRate: gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : null
  };
}

type LogsTableRow = {
  id: string;
  date: string;
  result: Result;
  format: string;
  go_order: "First" | "Second" | "";
  self_player_name: string;
  self_deck_name: string;
  self_deck_sprites: string;
  opponent_player_name: string;
  opponent_deck_name: string;
  opponent_deck_sprites: string;
  total_turns: number;
  linked_deck_id: string | null;
  linked_deck_list_id: string | null;
  imported_at: string;
};

type LogDetailTableRow = {
  id: string;
  user_id: string;
  date: string;
  result: Result;
  format: string;
  go_order: "First" | "Second" | "";
  self_player_name: string;
  self_deck_name: string;
  self_deck_slug: string;
  self_deck_sprites: string;
  opponent_player_name: string;
  opponent_deck_name: string;
  opponent_deck_slug: string;
  opponent_deck_sprites: string;
  total_turns: number;
  coin_toss_won: boolean | null;
  self_prizes_taken: number;
  opponent_prizes_taken: number;
  self_attack_damage: number;
  opponent_attack_damage: number;
  self_mulligans: number;
  opponent_mulligans: number;
  linked_deck_id: string | null;
  linked_deck_list_id: string | null;
  reason: string;
  raw_log?: string;
  sections: unknown;
  imported_at: string;
  created_at: string;
  updated_at: string;
};

function splitSprites(value: string) {
  return value
    .split(",")
    .map((sprite) => sprite.trim())
    .filter(Boolean);
}

function parseSections(value: unknown): LogSection[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value as LogSection[];
}

function mapLogSummary(row: LogsTableRow): BattleLogSummary {
  return {
    id: row.id,
    date: row.date,
    result: row.result,
    format: row.format,
    goOrder: row.go_order,
    selfPlayerName: row.self_player_name,
    selfDeckName: row.self_deck_name,
    selfDeckSprites: splitSprites(row.self_deck_sprites),
    opponentPlayerName: row.opponent_player_name,
    opponentDeckName: row.opponent_deck_name,
    opponentDeckSprites: splitSprites(row.opponent_deck_sprites),
    totalTurns: row.total_turns,
    linkedDeckId: row.linked_deck_id ?? undefined,
    linkedDeckListId: row.linked_deck_list_id ?? undefined,
    importedAt: row.imported_at
  };
}

function sortLogsByBattleDate(logs: BattleLogSummary[]) {
  return [...logs].sort((left, right) => {
    if (left.date !== right.date) {
      return right.date.localeCompare(left.date);
    }

    if (left.importedAt !== right.importedAt) {
      return right.importedAt.localeCompare(left.importedAt);
    }

    return right.id.localeCompare(left.id);
  });
}

function createEmptyLogSummaryStats(): LogSummaryStats {
  return {
    total: 0,
    wins: 0,
    losses: 0
  };
}

export function mapBattleLog(row: LogDetailTableRow): BattleLog {
  return {
    id: row.id,
    userId: row.user_id,
    date: row.date,
    result: row.result,
    format: row.format,
    goOrder: row.go_order,
    selfPlayerName: row.self_player_name,
    selfDeckName: row.self_deck_name,
    selfDeckSlug: row.self_deck_slug,
    selfDeckSprites: splitSprites(row.self_deck_sprites),
    opponentPlayerName: row.opponent_player_name,
    opponentDeckName: row.opponent_deck_name,
    opponentDeckSlug: row.opponent_deck_slug,
    opponentDeckSprites: splitSprites(row.opponent_deck_sprites),
    totalTurns: row.total_turns,
    coinTossWon: row.coin_toss_won,
    selfPrizesTaken: row.self_prizes_taken,
    opponentPrizesTaken: row.opponent_prizes_taken,
    selfAttackDamage: row.self_attack_damage,
    opponentAttackDamage: row.opponent_attack_damage,
    selfMulligans: row.self_mulligans,
    opponentMulligans: row.opponent_mulligans,
    linkedDeckId: row.linked_deck_id ?? undefined,
    linkedDeckListId: row.linked_deck_list_id ?? undefined,
    reason: row.reason,
    rawLog: row.raw_log ?? "",
    sections: parseSections(row.sections),
    importedAt: row.imported_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const logDetailSummarySelect = [
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
  "imported_at",
  "created_at",
  "updated_at"
].join(",");

const logDetailBodySelect = ["id", "user_id", "raw_log", "sections"].join(",");

type LogDetailBodyTableRow = Pick<LogDetailTableRow, "id" | "user_id" | "raw_log" | "sections">;

export type LogDetailBody = {
  rawLog: string;
  sections: LogSection[];
};

function mapBattleLogSummary(row: Omit<LogDetailTableRow, "raw_log" | "sections">): BattleLog {
  return mapBattleLog({
    ...row,
    raw_log: "",
    sections: []
  });
}

function mapLogDetailBody(row: LogDetailBodyTableRow): LogDetailBody {
  return {
    rawLog: row.raw_log ?? "",
    sections: parseSections(row.sections)
  };
}

function normalizeWindowDays(value?: number) {
  if (!Number.isFinite(value) || Number(value) <= 0) {
    return DEFAULT_LOG_WINDOW_DAYS;
  }

  return Math.max(1, Math.floor(Number(value)));
}

function normalizeDateString(value?: string) {
  const trimmed = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  return new Date().toISOString().slice(0, 10);
}

function shiftDateString(date: string, dayOffset: number) {
  const [year, month, day] = normalizeDateString(date).split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day));
  shifted.setUTCDate(shifted.getUTCDate() + dayOffset);
  return shifted.toISOString().slice(0, 10);
}

type LogsCursor = {
  date: string;
  id: string;
  importedAt: string;
};

function encodeLogsCursor(log: BattleLogSummary) {
  return Buffer.from(
    JSON.stringify({
      date: log.date,
      id: log.id,
      importedAt: log.importedAt
    } satisfies LogsCursor)
  ).toString("base64url");
}

function decodeLogsCursor(value: string | undefined): LogsCursor | null {
  if (!value) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<LogsCursor>;
    if (
      typeof decoded.date === "string" &&
      typeof decoded.importedAt === "string" &&
      typeof decoded.id === "string"
    ) {
      return {
        date: decoded.date,
        id: decoded.id,
        importedAt: decoded.importedAt
      };
    }
  } catch {
    return null;
  }

  return null;
}

function escapePostgrestFilterValue(value: string) {
  return value.replaceAll(",", "%2C");
}

function buildLogsCursorFilter(cursor: LogsCursor) {
  const date = escapePostgrestFilterValue(cursor.date);
  const importedAt = escapePostgrestFilterValue(cursor.importedAt);
  const id = escapePostgrestFilterValue(cursor.id);

  return [
    `date.lt.${date}`,
    `and(date.eq.${date},imported_at.lt.${importedAt})`,
    `and(date.eq.${date},imported_at.eq.${importedAt},id.lt.${id})`
  ].join(",");
}

export async function getLogSummaryStats(userId: string): Promise<LogSummaryStats> {
  const supabase = await logsDbTestHooks.createClient();
  const { data, error } = await measureServerCall("db.logs.summaryStatsRollup", async () =>
    await supabase
      .from("user_log_stats")
      .select("games_played,games_won,games_lost")
      .eq("user_id", userId)
      .maybeSingle()
  );

  if (error) {
    throw error;
  }

  const row = ((data ?? null) as unknown) as LogSummaryStatsRow | null;

  return {
    total: Number(row?.games_played ?? 0),
    wins: Number(row?.games_won ?? 0),
    losses: Number(row?.games_lost ?? 0)
  };
}

export const getLogStatsOverview = cache(async function getLogStatsOverview(
  userId?: string
): Promise<LogStatsOverview> {
  const supabase = await logsDbTestHooks.createClient();
  const { data, error } = await measureServerCall("db.logs.statsOverviewRpc", async () =>
    await supabase.rpc("get_log_stats_overview")
  );

  if (!error) {
    const row = Array.isArray(data)
      ? (((data[0] ?? null) as unknown) as LogStatsOverviewRpcRow | null)
      : (((data ?? null) as unknown) as LogStatsOverviewRpcRow | null);

    if (row) {
      return mapLogStatsOverviewRow(row);
    }
  }

  const resolvedUserId = userId || (await measureServerCall("db.logs.statsOverviewReadModel.requireUser", async () =>
    await requireUser()
  )).id;
  const { data: fallbackData, error: fallbackError } = await measureServerCall(
    "db.logs.statsOverviewReadModelFallback",
    async () =>
      await supabase
        .from("user_log_stats")
        .select(
          [
            "games_played",
            "games_won",
            "games_lost",
            "attack_damage",
            "opponent_attack_damage",
            "coin_flips_won",
            "mulligans_taken",
            "prizes_taken",
            "tracked_damage",
            "tracked_prizes"
          ].join(",")
        )
        .eq("user_id", resolvedUserId)
        .maybeSingle()
  );

  if (fallbackError) {
    throw fallbackError;
  }

  return mapLogStatsOverviewRow(((fallbackData ?? null) as unknown) as LogStatsOverviewRpcRow | null);
});

export const getArchetypeMatchupStats = cache(async function getArchetypeMatchupStats(
  userId?: string
): Promise<ArchetypeMatchupStats[]> {
  const supabase = await logsDbTestHooks.createClient();
  const resolvedUserId = userId || (await measureServerCall("db.logs.archetypeMatchups.requireUser", async () =>
    await requireUser()
  )).id;
  const { data, error } = await measureServerCall("db.logs.archetypeMatchupsReadModel", async () =>
    await supabase
      .from("user_archetype_matchup_stats")
      .select(
        [
          "matchup_key",
          "opponent_deck_name",
          "opponent_deck_sprites",
          "source_deck_slugs",
          "games_played",
          "games_won",
          "games_lost",
          "last_played_date"
        ].join(",")
      )
      .eq("user_id", resolvedUserId)
      .order("games_played", { ascending: false })
      .order("games_won", { ascending: false })
      .order("opponent_deck_name", { ascending: true })
  );

  if (error) {
    throw error;
  }

  return (((data ?? []) as unknown) as ArchetypeMatchupStatsRow[]).map(mapArchetypeMatchupStatsRow);
});

export async function getLogsWindow(
  userId: string,
  options?: {
    cursor?: string;
    limit?: number;
    windowDays?: number;
    windowEndDate?: string;
  }
) {
  const supabase = await logsDbTestHooks.createClient();
  const windowDays = normalizeWindowDays(options?.windowDays);
  const windowEndDate = normalizeDateString(options?.windowEndDate);
  const windowStartDate = shiftDateString(windowEndDate, -(windowDays - 1));
  const cursor = decodeLogsCursor(options?.cursor ?? options?.windowEndDate);
  const pageSize = Math.max(1, Math.min(100, options?.limit ?? DEFAULT_LOG_WINDOW_LIMIT));

  let query = supabase
    .from("logs")
    .select(
      [
        "id",
        "date",
        "result",
        "format",
        "go_order",
        "self_player_name",
        "self_deck_name",
        "self_deck_sprites",
        "opponent_player_name",
        "opponent_deck_name",
        "opponent_deck_sprites",
        "total_turns",
        "linked_deck_id",
        "linked_deck_list_id",
        "imported_at"
      ].join(",")
    )
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .order("imported_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (cursor) {
    query = query.or(buildLogsCursorFilter(cursor));
  }

  const { data, error } = await measureServerCall("db.logs.window", async () => await query);

  if (error) {
    throw error;
  }

  const rows = ((data ?? []) as unknown) as LogsTableRow[];
  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
  const logs = pageRows.map(mapLogSummary);
  const nextCursor = hasMore && logs.length > 0 ? encodeLogsCursor(logs[logs.length - 1]) : "";

  return {
    logs,
    hasMore,
    windowDays,
    windowStartDate: logs.at(-1)?.date ?? windowStartDate,
    windowEndDate: logs.at(0)?.date ?? windowEndDate,
    nextWindowEndDate: nextCursor
  };
}

export async function getLogsPage(userId: string, cursor?: string, limit = 30) {
  const supabase = await logsDbTestHooks.createClient();
  const pageSize = Math.max(1, limit);
  const decodedCursor = decodeLogsCursor(cursor);

  let query = supabase
    .from("logs")
    .select(
      [
        "id",
        "date",
        "result",
        "format",
        "go_order",
        "self_player_name",
        "self_deck_name",
        "self_deck_sprites",
        "opponent_player_name",
        "opponent_deck_name",
        "opponent_deck_sprites",
        "total_turns",
        "linked_deck_id",
        "linked_deck_list_id",
        "imported_at"
      ].join(",")
    )
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .order("imported_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (decodedCursor) {
    query = query.or(buildLogsCursorFilter(decodedCursor));
  }

  const { data, error } = await measureServerCall("db.logs.page", async () => await query);

  if (error) {
    throw error;
  }

  const rows = ((data ?? []) as unknown) as LogsTableRow[];
  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
  const logs = pageRows.map(mapLogSummary);
  const nextCursor = hasMore && logs.length > 0 ? encodeLogsCursor(logs[logs.length - 1]) : undefined;

  return {
    logs,
    hasMore,
    nextCursor
  };
}

export async function getLogById(
  userId: string,
  logId: string
): Promise<BattleLog | null> {
  const supabase = await logsDbTestHooks.createClient();

  const { data, error } = await measureServerCall("db.logs.byId", async () =>
    await supabase
      .from("logs")
      .select(
        [
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
          "imported_at",
          "created_at",
          "updated_at"
        ].join(",")
      )
      .eq("user_id", userId)
      .eq("id", logId)
      .maybeSingle()
  );

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return mapBattleLog((data as unknown) as LogDetailTableRow);
}

export async function getLogDetailSummaryById(
  userId: string,
  logId: string
): Promise<BattleLog | null> {
  const supabase = await logsDbTestHooks.createClient();

  const { data, error } = await measureServerCall("db.logs.byId.summary", async () =>
    await supabase
      .from("logs")
      .select(logDetailSummarySelect)
      .eq("user_id", userId)
      .eq("id", logId)
      .maybeSingle()
  );

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return mapBattleLogSummary((data as unknown) as Omit<LogDetailTableRow, "raw_log" | "sections">);
}

export async function getLogDetailBodyById(
  userId: string,
  logId: string
): Promise<LogDetailBody | null> {
  const supabase = await logsDbTestHooks.createClient();

  const { data, error } = await measureServerCall("db.logs.byId.body", async () =>
    await supabase
      .from("logs")
      .select(logDetailBodySelect)
      .eq("user_id", userId)
      .eq("id", logId)
      .maybeSingle()
  );

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return mapLogDetailBody((data as unknown) as LogDetailBodyTableRow);
}

async function getLogsIndexedByDeck(
  userId: string,
  decks: DeckLinkCandidate[],
  targetDeckIdsInput?: string[],
  options: { includeUnlinkedFallback?: boolean } = {}
) {
  const knownDeckIds = new Set(decks.map((deck) => deck.id));
  const targetDeckIds = (targetDeckIdsInput?.length ? targetDeckIdsInput : decks.map((deck) => deck.id))
    .filter((deckId) => knownDeckIds.has(deckId));

  if (targetDeckIds.length === 0) {
    return new Map<string, BattleLogSummary[]>();
  }

  const supabase = await logsDbTestHooks.createClient();
  const logSummarySelect = [
    "id",
    "date",
    "result",
    "format",
    "go_order",
    "self_player_name",
    "self_deck_name",
    "self_deck_sprites",
    "opponent_player_name",
    "opponent_deck_name",
    "opponent_deck_sprites",
    "total_turns",
    "linked_deck_id",
    "linked_deck_list_id",
    "imported_at"
  ].join(",");
  const explicitResult = await measureServerCall("db.logs.forDecks.explicit", async () =>
    await supabase
      .from("logs")
      .select(logSummarySelect)
      .eq("user_id", userId)
      .in("linked_deck_id", targetDeckIds)
  );

  if (explicitResult.error) {
    throw explicitResult.error;
  }

  if (!options.includeUnlinkedFallback) {
    return groupLogsByDeck({
      decks,
      explicitRows: (((explicitResult.data ?? []) as unknown) as LogsTableRow[]),
      targetDeckIds,
      unlinkedRows: []
    });
  }

  const unlinkedResult = await measureServerCall("db.logs.forDecks.unlinked", async () =>
    await supabase
      .from("logs")
      .select(logSummarySelect)
      .eq("user_id", userId)
      .is("linked_deck_id", null)
  );

  if (unlinkedResult.error) {
    throw unlinkedResult.error;
  }

  return groupLogsByDeck({
    decks,
    explicitRows: (((explicitResult.data ?? []) as unknown) as LogsTableRow[]),
    targetDeckIds,
    unlinkedRows: (((unlinkedResult.data ?? []) as unknown) as LogsTableRow[])
  });
}

export function groupLogsByDeck(input: {
  decks: DeckLinkCandidate[];
  explicitRows: LogsTableRow[];
  targetDeckIds: string[];
  unlinkedRows: LogsTableRow[];
}) {
  const { decks, explicitRows, targetDeckIds, unlinkedRows } = input;

  const groupedLogs = new Map<string, Map<string, BattleLogSummary>>(
    targetDeckIds.map((deckId) => [deckId, new Map<string, BattleLogSummary>()])
  );

  const addLogToDeck = (deckId: string, log: BattleLogSummary) => {
    const deckLogs = groupedLogs.get(deckId);
    if (!deckLogs) {
      return;
    }

    deckLogs.set(log.id, log);
  };

  explicitRows.map(mapLogSummary).forEach((log) => {
      if (log.linkedDeckId) {
        addLogToDeck(log.linkedDeckId, log);
      }
    });

  unlinkedRows.map(mapLogSummary).forEach((log) => {
      const resolvedDeckId = resolveLinkedDeck(decks, {
        linkedDeckId: log.linkedDeckId,
        selfDeckName: log.selfDeckName,
        selfDeckSprites: log.selfDeckSprites
      });

      if (resolvedDeckId) {
        addLogToDeck(resolvedDeckId, log);
      }
    });

  return new Map(
    Array.from(groupedLogs.entries()).map(([deckId, deckLogs]) => [
      deckId,
      sortLogsByBattleDate(Array.from(deckLogs.values()))
    ])
  );
}

export async function getAllLogsByDeck(
  userId: string,
  decks: DeckLinkCandidate[],
  targetDeckIdsInput?: string[]
) {
  return await getLogsIndexedByDeck(userId, decks, targetDeckIdsInput, {
    includeUnlinkedFallback: true
  });
}

export async function getDeckLogSnapshots(
  userId: string,
  decks: DeckLinkCandidate[],
  targetDeckIdsInput?: string[]
) {
  const logsByDeck = await getLogsIndexedByDeck(userId, decks, targetDeckIdsInput, {
    includeUnlinkedFallback: true
  });

  return new Map<string, DeckLogSnapshot>(
    Array.from(logsByDeck.entries()).map(([deckId, logs]) => [
      deckId,
      {
        logs,
        stats: getBattleLogSummaryStats(logs)
      }
    ])
  );
}

export async function getDeckStatsForIndex(
  userId: string,
  decks: DeckLinkCandidate[],
  targetDeckIdsInput?: string[]
) {
  const knownDeckIds = new Set(decks.map((deck) => deck.id));
  const targetDeckIds = (targetDeckIdsInput?.length ? targetDeckIdsInput : decks.map((deck) => deck.id))
    .filter((deckId) => knownDeckIds.has(deckId));

  if (targetDeckIds.length === 0) {
    return new Map<string, LogSummaryStats>();
  }

  const statsByDeck = new Map<string, LogSummaryStats>(
    targetDeckIds.map((deckId) => [deckId, createEmptyLogSummaryStats()])
  );
  const supabase = await logsDbTestHooks.createClient();
  const statsResult = await measureServerCall("db.logs.statsForDecks.readModel", async () =>
    await supabase
      .from("deck_log_stats")
      .select(["deck_id", "games_played", "games_won", "games_lost"].join(","))
      .eq("user_id", userId)
      .in("deck_id", targetDeckIds)
  );

  if (statsResult.error) {
    throw statsResult.error;
  }

  ((((statsResult.data ?? []) as unknown) as DeckLogStatsReadModelRow[])).forEach((row) => {
    const deckId = row.deck_id ?? "";
    const deckStats = statsByDeck.get(deckId);

    if (!deckStats) {
      return;
    }

    deckStats.total = Number(row.games_played ?? 0);
    deckStats.wins = Number(row.games_won ?? 0);
    deckStats.losses = Number(row.games_lost ?? 0);
  });

  return statsByDeck;
}

export async function getLogsForDeck(
  userId: string,
  deckId: string,
  decks: DeckLinkCandidate[],
  limit = 10
): Promise<BattleLogSummary[]> {
  if (!decks.some((candidate) => candidate.id === deckId)) {
    return [];
  }

  return getLatestLogsForDeck(userId, deckId, limit);
}

export async function getLatestLogsForDeck(
  userId: string,
  deckId: string,
  limit = 5
): Promise<BattleLogSummary[]> {
  if (!deckId) {
    return [];
  }

  const supabase = await logsDbTestHooks.createClient();
  const pageSize = Math.max(1, Math.min(25, limit));
  const { data, error } = await measureServerCall("db.logs.forDeck.latest", async () =>
    await supabase
      .from("logs")
      .select(
        [
          "id",
          "date",
          "result",
          "format",
          "go_order",
          "self_player_name",
          "self_deck_name",
          "self_deck_sprites",
          "opponent_player_name",
          "opponent_deck_name",
          "opponent_deck_sprites",
          "total_turns",
          "linked_deck_id",
          "linked_deck_list_id",
          "imported_at"
        ].join(",")
      )
      .eq("user_id", userId)
      .eq("linked_deck_id", deckId)
      .order("date", { ascending: false })
      .order("imported_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(pageSize)
  );

  if (error) {
    throw error;
  }

  return (((data ?? []) as unknown) as LogsTableRow[]).map(mapLogSummary);
}

export async function getAllLogsForDeck(
  userId: string,
  deckId: string,
  decks: DeckLinkCandidate[]
): Promise<BattleLogSummary[]> {
  if (!decks.some((candidate) => candidate.id === deckId)) {
    return [];
  }
  const logsByDeck = await getLogsIndexedByDeck(userId, decks, [deckId]);
  return logsByDeck.get(deckId) ?? [];
}

export function getBattleLogSummaryStats(logs: BattleLogSummary[]): LogSummaryStats {
  return logs.reduce(
    (stats, log) => {
      stats.total += 1;
      if (log.result === "Win") {
        stats.wins += 1;
      } else if (log.result === "Loss") {
        stats.losses += 1;
      }

      return stats;
    },
    { total: 0, wins: 0, losses: 0 }
  );
}
