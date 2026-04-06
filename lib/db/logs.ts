import { createClient } from "@/lib/supabase/server";
import type { BattleLogSummary, Result } from "@/types/index";

type LogSummaryStats = {
  total: number;
  wins: number;
  losses: number;
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
  imported_at: string;
};

function splitSprites(value: string) {
  return value
    .split(",")
    .map((sprite) => sprite.trim())
    .filter(Boolean);
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
    importedAt: row.imported_at
  };
}

export async function getLogSummaryStats(userId: string): Promise<LogSummaryStats> {
  const supabase = createClient();

  const [totalQuery, winsQuery, lossesQuery] = await Promise.all([
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

  if (totalQuery.error) {
    throw totalQuery.error;
  }

  if (winsQuery.error) {
    throw winsQuery.error;
  }

  if (lossesQuery.error) {
    throw lossesQuery.error;
  }

  return {
    total: totalQuery.count ?? 0,
    wins: winsQuery.count ?? 0,
    losses: lossesQuery.count ?? 0
  };
}

export async function getLogsPage(userId: string, cursor?: string, limit = 30) {
  const supabase = createClient();
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

  const { data, error } = await query;

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
