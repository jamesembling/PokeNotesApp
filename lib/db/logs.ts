import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { measureServerCall } from "@/lib/server/perf";
import { resolveLinkedDeck } from "@/lib/log-import/deck-linking";
import type { BattleLog, BattleLogSummary, DeckSummary, LogSection, Result } from "@/types/index";

export const logsDbTestHooks = {
  createClient: createSupabaseClient
};

const DEFAULT_LOG_WINDOW_DAYS = 7;

type LogSummaryStats = {
  total: number;
  wins: number;
  losses: number;
};

type StatsOverviewRow = {
  result: Result;
  coin_toss_won: boolean | null;
  self_prizes_taken: number;
  opponent_prizes_taken: number;
  self_attack_damage: number;
  opponent_attack_damage: number;
  self_mulligans: number;
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

    return right.importedAt.localeCompare(left.importedAt);
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
    reason: row.reason,
    rawLog: row.raw_log ?? "",
    sections: parseSections(row.sections),
    importedAt: row.imported_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
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

export async function getLogSummaryStats(userId: string): Promise<LogSummaryStats> {
  const supabase = await logsDbTestHooks.createClient();
  const [total, wins, losses] = await measureServerCall("db.logs.summaryStats", async () => {
    const [{ count: totalCount, error: totalError }, { count: winsCount, error: winsError }, { count: lossesCount, error: lossesError }] =
      await Promise.all([
        supabase.from("logs").select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabase
          .from("logs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("result", "Win"),
        supabase
          .from("logs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("result", "Loss")
      ]);

    if (totalError) {
      throw totalError;
    }

    if (winsError) {
      throw winsError;
    }

    if (lossesError) {
      throw lossesError;
    }

    return [totalCount ?? 0, winsCount ?? 0, lossesCount ?? 0] as const;
  });

  return {
    total,
    wins,
    losses
  };
}

export async function getLogStatsOverview(userId: string): Promise<LogStatsOverview> {
  const supabase = await logsDbTestHooks.createClient();
  const { data, error } = await measureServerCall("db.logs.statsOverviewRpc", async () =>
    await supabase.rpc("get_log_stats_overview")
  );

  if (!error) {
    const row = Array.isArray(data)
      ? (((data[0] ?? null) as unknown) as LogStatsOverviewRpcRow | null)
      : (((data ?? null) as unknown) as LogStatsOverviewRpcRow | null);

    if (row) {
      return {
        gamesPlayed: Number(row.games_played ?? 0),
        gamesWon: Number(row.games_won ?? 0),
        gamesLost: Number(row.games_lost ?? 0),
        attackDamage: Number(row.attack_damage ?? 0),
        opponentAttackDamage: Number(row.opponent_attack_damage ?? 0),
        coinFlipsWon: Number(row.coin_flips_won ?? 0),
        mulligansTaken: Number(row.mulligans_taken ?? 0),
        prizesTaken: Number(row.prizes_taken ?? 0),
        trackedDamage: Number(row.tracked_damage ?? 0),
        trackedPrizes: Number(row.tracked_prizes ?? 0)
      };
    }
  }

  const { data: fallbackData, error: fallbackError } = await measureServerCall(
    "db.logs.statsOverviewFallback",
    async () =>
      await supabase
        .from("logs")
        .select(
          [
            "result",
            "coin_toss_won",
            "self_prizes_taken",
            "opponent_prizes_taken",
            "self_attack_damage",
            "opponent_attack_damage",
            "self_mulligans"
          ].join(",")
        )
        .eq("user_id", userId)
  );

  if (fallbackError) {
    throw fallbackError;
  }

  return (((fallbackData ?? []) as unknown) as StatsOverviewRow[]).reduce<LogStatsOverview>(
    (totals, row) => {
      totals.gamesPlayed += 1;

      if (row.result === "Win") {
        totals.gamesWon += 1;
      } else if (row.result === "Loss") {
        totals.gamesLost += 1;
      }

      if (row.coin_toss_won) {
        totals.coinFlipsWon += 1;
      }

      totals.attackDamage += Number(row.self_attack_damage || 0);
      totals.opponentAttackDamage += Number(row.opponent_attack_damage || 0);
      totals.mulligansTaken += Number(row.self_mulligans || 0);
      totals.prizesTaken += Number(row.self_prizes_taken || 0);
      totals.trackedDamage +=
        Number(row.self_attack_damage || 0) + Number(row.opponent_attack_damage || 0);
      totals.trackedPrizes +=
        Number(row.self_prizes_taken || 0) + Number(row.opponent_prizes_taken || 0);

      return totals;
    },
    {
      gamesPlayed: 0,
      gamesWon: 0,
      gamesLost: 0,
      attackDamage: 0,
      opponentAttackDamage: 0,
      coinFlipsWon: 0,
      mulligansTaken: 0,
      prizesTaken: 0,
      trackedDamage: 0,
      trackedPrizes: 0
    }
  );
}

export async function getLogsWindow(
  userId: string,
  options?: {
    windowDays?: number;
    windowEndDate?: string;
  }
) {
  const supabase = await logsDbTestHooks.createClient();
  const windowDays = normalizeWindowDays(options?.windowDays);
  const windowEndDate = normalizeDateString(options?.windowEndDate);
  const windowStartDate = shiftDateString(windowEndDate, -(windowDays - 1));

  const { data, error } = await measureServerCall("db.logs.window", async () =>
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
      .gte("date", windowStartDate)
      .lte("date", windowEndDate)
      .order("date", { ascending: false })
      .order("imported_at", { ascending: false })
  );

  if (error) {
    throw error;
  }

  const { data: olderRows, error: olderError } = await measureServerCall(
    "db.logs.window.hasOlder",
    async () =>
      await supabase
        .from("logs")
        .select("id")
        .eq("user_id", userId)
        .lt("date", windowStartDate)
        .limit(1)
  );

  if (olderError) {
    throw olderError;
  }

  const logs = (((data ?? []) as unknown) as LogsTableRow[]).map(mapLogSummary);
  const hasOlder = (olderRows?.length ?? 0) > 0;

  return {
    logs,
    hasMore: hasOlder,
    windowDays,
    windowStartDate,
    windowEndDate,
    nextWindowEndDate: hasOlder ? shiftDateString(windowStartDate, -1) : ""
  };
}

export async function getLogsPage(userId: string, cursor?: string, limit = 30) {
  const supabase = await logsDbTestHooks.createClient();
  const pageSize = Math.max(1, limit);

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
    .limit(pageSize + 1);

  if (cursor) {
    query = query.lte("date", cursor);
  }

  const { data, error } = await measureServerCall("db.logs.page", async () => await query);

  if (error) {
    throw error;
  }

  const rows = ((data ?? []) as unknown) as LogsTableRow[];
  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
  const logs = pageRows.map(mapLogSummary);
  const nextCursor = hasMore ? logs.at(-1)?.date : undefined;

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

async function getLogsIndexedByDeck(
  userId: string,
  decks: DeckSummary[],
  targetDeckIdsInput?: string[]
) {
  const knownDeckIds = new Set(decks.map((deck) => deck.id));
  const targetDeckIds = (targetDeckIdsInput?.length ? targetDeckIdsInput : decks.map((deck) => deck.id))
    .filter((deckId) => knownDeckIds.has(deckId));

  if (targetDeckIds.length === 0) {
    return new Map<string, BattleLogSummary[]>();
  }

  const supabase = await logsDbTestHooks.createClient();
  const [explicitResult, unlinkedResult] = await Promise.all([
    measureServerCall("db.logs.forDecks.explicit", async () =>
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
        .in("linked_deck_id", targetDeckIds)
    ),
    measureServerCall("db.logs.forDecks.unlinked", async () =>
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
        .is("linked_deck_id", null)
    )
  ]);

  if (explicitResult.error) {
    throw explicitResult.error;
  }

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
  decks: DeckSummary[];
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
  decks: DeckSummary[],
  targetDeckIdsInput?: string[]
) {
  return await getLogsIndexedByDeck(userId, decks, targetDeckIdsInput);
}

export async function getLogsForDeck(
  userId: string,
  deckId: string,
  decks: DeckSummary[],
  limit = 10
): Promise<BattleLogSummary[]> {
  const logs = await getAllLogsForDeck(userId, deckId, decks);
  return logs.slice(0, Math.max(1, limit));
}

export async function getAllLogsForDeck(
  userId: string,
  deckId: string,
  decks: DeckSummary[]
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
