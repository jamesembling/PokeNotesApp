import { cache } from "react";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { measureServerCall } from "@/lib/server/perf";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import type { DeckLinkCandidate } from "@/lib/log-import/deck-linking";
import type { BattleLog, BattleLogSummary, LogSection, Result } from "@/types/index";
import { compactMap } from "@/lib/array";
import { decodeLogSections } from "@/lib/battle-log/runtime-validation";
import { reportError } from "@/lib/server/report-error";

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

export type LogStatsOverview = {
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  attackDamage: number;
  opponentAttackDamage: number;
  coinFlipsLost: number;
  coinFlipsWon: number;
  mulligansTaken: number;
  prizesTaken: number;
  trackedDamage: number;
  trackedPrizes: number;
};

export type LogDamageTimelinePoint = {
  date: string;
  result?: Result | null;
  selfAttackDamage: number;
  opponentAttackDamage: number;
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
  coin_flips_lost?: number | null;
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

type LogDamageTimelineRow = {
  date: string | null;
  result: string | null;
  self_attack_damage: number | null;
  opponent_attack_damage: number | null;
};

function mapLogStatsOverviewRow(row: LogStatsOverviewRpcRow | null): LogStatsOverview {
  return {
    gamesPlayed: Number(row?.games_played ?? 0),
    gamesWon: Number(row?.games_won ?? 0),
    gamesLost: Number(row?.games_lost ?? 0),
    attackDamage: Number(row?.attack_damage ?? 0),
    opponentAttackDamage: Number(row?.opponent_attack_damage ?? 0),
    coinFlipsLost: Number(row?.coin_flips_lost ?? 0),
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
  linked_deck_list_name?: string | null;
  imported_at: string;
};

type InitialLogsPageDataRpcRow = {
  logs?: LogsTableRow[] | null;
  stats?: LogSummaryStatsRow | null;
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
  match_notes: string | null;
  reason: string;
  raw_log?: string;
  sections: unknown;
  imported_at: string;
  created_at: string;
  updated_at: string;
};

function splitSprites(value: string) {
  return compactMap(value
    .split(","), (sprite) => sprite.trim());
}

function parseSections(value: unknown, row: Pick<LogDetailTableRow, "id" | "user_id">): LogSection[] {
  const sections = decodeLogSections(value);
  if (sections) {
    return sections;
  }

  reportError(new Error("Stored battle log sections failed runtime validation."), {
    area: "logs",
    boundary: "database-read",
    logId: row.id,
    userId: row.user_id
  });
  return [];
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
    linkedDeckListName: row.linked_deck_list_name ?? undefined,
    importedAt: row.imported_at
  };
}

function sortLogsByBattleDate(logs: BattleLogSummary[]) {
  return logs.toSorted((left, right) => {
    if (left.date !== right.date) {
      return right.date.localeCompare(left.date);
    }

    if (left.importedAt !== right.importedAt) {
      return right.importedAt.localeCompare(left.importedAt);
    }

    return right.id.localeCompare(left.id);
  });
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
    matchNotes: row.match_notes,
    reason: row.reason,
    rawLog: row.raw_log ?? "",
    sections: parseSections(row.sections, row),
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
  "match_notes",
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
    sections: parseSections(row.sections, row)
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

function isDateString(value: string | undefined) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
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

export async function getInitialLogsPageDataWithClient(
  supabase: Awaited<ReturnType<typeof createSupabaseClient>>
) {
  return (await getInitialLogsPageDataWithClientDiagnostics(supabase)).value;
}

export async function getInitialLogsPageDataWithClientDiagnostics(
  supabase: Awaited<ReturnType<typeof createSupabaseClient>>
) {
  const supabaseStartedAt = performance.now();
  const { data, error } = await supabase.rpc("get_initial_logs_page_data", {
    p_limit: DEFAULT_LOG_WINDOW_LIMIT + 1
  });
  const supabaseMs = Math.max(0, Math.round(performance.now() - supabaseStartedAt));

  if (error) {
    return {
      error,
      failureReason: "rpc-error" as const,
      mappingMs: null,
      resultBytes: null,
      resultRows: null,
      supabaseMs,
      value: null
    };
  }

  if (!data || Array.isArray(data) || typeof data !== "object") {
    return {
      error: new Error("Initial logs RPC returned a non-object payload."),
      failureReason: "invalid-payload" as const,
      mappingMs: null,
      resultBytes: null,
      resultRows: null,
      supabaseMs,
      value: null
    };
  }

  const payload = data as InitialLogsPageDataRpcRow;
  if (!Array.isArray(payload.logs)) {
    return {
      error: new Error("Initial logs RPC payload did not contain a logs array."),
      failureReason: "invalid-payload" as const,
      mappingMs: null,
      resultBytes: null,
      resultRows: null,
      supabaseMs,
      value: null
    };
  }

  const mappingStartedAt = performance.now();
  const rows = payload.logs;
  const value = {
    stats: {
      total: Number(payload.stats?.games_played ?? 0),
      wins: Number(payload.stats?.games_won ?? 0),
      losses: Number(payload.stats?.games_lost ?? 0)
    },
    window: buildLogsWindowFromRows(rows, {
      pageSize: DEFAULT_LOG_WINDOW_LIMIT,
      queryWindowEndDate: normalizeDateString(),
      requestedWindowEndDate: undefined,
      windowDays: DEFAULT_LOG_WINDOW_DAYS
    })
  };

  return {
    error: null,
    failureReason: null,
    mappingMs: Math.max(0, Math.round(performance.now() - mappingStartedAt)),
    resultBytes: new TextEncoder().encode(JSON.stringify(value)).byteLength,
    resultRows: rows.length,
    supabaseMs,
    value
  };
}

export async function getInitialLogsPageData() {
  const supabase = await logsDbTestHooks.createClient();
  return getInitialLogsPageDataWithClient(supabase);
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

    if (row?.coin_flips_lost !== undefined) {
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
            "coin_flips_lost",
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

export const getLogDamageTimeline = cache(async function getLogDamageTimeline(
  userId: string,
  limit = 5000
): Promise<LogDamageTimelinePoint[]> {
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(5000, Math.round(limit))) : 5000;
  const supabase = await logsDbTestHooks.createClient();
  const { data, error } = await measureServerCall("db.logs.damageTimeline", async () =>
    await supabase
      .from("logs")
      .select("date,result,self_attack_damage,opponent_attack_damage")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .order("imported_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(boundedLimit)
  );

  if (error) {
    throw error;
  }

  return (((data ?? []) as unknown) as LogDamageTimelineRow[])
    .toReversed()
    .map((row) => ({
      date: String(row.date ?? ""),
      result: row.result === "Win" || row.result === "Loss" ? row.result : null,
      selfAttackDamage: Number(row.self_attack_damage ?? 0),
      opponentAttackDamage: Number(row.opponent_attack_damage ?? 0)
    }));
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
  const cursorDate = isDateString(options?.cursor) ? options?.cursor : undefined;
  const cursor = decodeLogsCursor(options?.cursor);
  const requestedWindowEndDate = options?.windowEndDate ?? cursorDate ?? cursor?.date;
  const queryWindowEndDate = normalizeDateString(requestedWindowEndDate);
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

  if (requestedWindowEndDate) {
    query = query.lte("date", queryWindowEndDate);
  }

  if (cursor) {
    query = query.or(buildLogsCursorFilter(cursor));
  }

  const { data, error } = await measureServerCall("db.logs.window", async () => await query);

  if (error) {
    throw error;
  }

  const rows = ((data ?? []) as unknown) as LogsTableRow[];
  return buildLogsWindowFromRows(rows, {
    pageSize,
    queryWindowEndDate,
    requestedWindowEndDate,
    windowDays
  });
}

function buildLogsWindowFromRows(
  rows: LogsTableRow[],
  {
    pageSize,
    queryWindowEndDate,
    requestedWindowEndDate,
    windowDays
  }: {
    pageSize: number;
    queryWindowEndDate: string;
    requestedWindowEndDate: string | undefined;
    windowDays: number;
  }
) {
  const requestedWindowStartDate = shiftDateString(queryWindowEndDate, -(windowDays - 1));
  const hasRowsInRequestedWindow = rows.some(
    (row) => row.date <= queryWindowEndDate && row.date >= requestedWindowStartDate
  );
  const shouldReanchorSparseWindow =
    Boolean(requestedWindowEndDate) && rows.length > 0 && !hasRowsInRequestedWindow;
  const windowEndDate = shouldReanchorSparseWindow
    ? rows[0].date
    : requestedWindowEndDate
      ? queryWindowEndDate
      : rows[0]?.date ?? queryWindowEndDate;
  const windowStartDate = shiftDateString(windowEndDate, -(windowDays - 1));
  const visibleRows = rows.filter((row) => row.date <= windowEndDate && row.date >= windowStartDate).slice(0, pageSize);
  const hasMoreInWindow = rows.length > pageSize && rows[pageSize]?.date <= windowEndDate && rows[pageSize]?.date >= windowStartDate;
  const hasOlderRows = rows.some((row) => row.date < windowStartDate);
  const hasMore = hasMoreInWindow || hasOlderRows;
  const pageRows = visibleRows;
  const logs = pageRows.map(mapLogSummary);
  const nextCursor =
    hasMoreInWindow && logs.length > 0
      ? encodeLogsCursor(logs[logs.length - 1])
      : hasOlderRows
        ? shiftDateString(windowStartDate, -1)
        : "";

  return {
    logs,
    hasMore,
    windowDays,
    windowStartDate,
    windowEndDate,
    nextWindowEndDate: nextCursor
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
          "match_notes",
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
  targetDeckIdsInput?: string[]
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
  const explicitRows = await measureServerCall("db.logs.forDecks.explicit", () =>
    fetchAllRows<LogsTableRow>((from, to) =>
      supabase
        .from("logs")
        .select(logSummarySelect)
        .eq("user_id", userId)
        .in("linked_deck_id", targetDeckIds)
        .order("id", { ascending: true })
        .range(from, to) as PromiseLike<{ data: LogsTableRow[] | null; error: unknown }>,
      500
    )
  );

  return groupLogsByDeck(explicitRows, targetDeckIds);
}

function groupLogsByDeck(explicitRows: LogsTableRow[], targetDeckIds: string[]) {
  const groupedLogs = new Map<string, Map<string, BattleLogSummary>>(
    targetDeckIds.map((deckId) => [deckId, new Map<string, BattleLogSummary>()])
  );

  explicitRows.forEach((row) => {
    const log = mapLogSummary(row);
    if (log.linkedDeckId) {
      groupedLogs.get(log.linkedDeckId)?.set(log.id, log);
    }
  });

  return new Map(
    Array.from(groupedLogs.entries()).map(([deckId, deckLogs]) => [
      deckId,
      sortLogsByBattleDate(Array.from(deckLogs.values()))
    ])
  );
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
