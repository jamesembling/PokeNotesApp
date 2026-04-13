import { unstable_cache } from "next/cache";
import { buildDeckArchetypeId, normalizeDeckArchetypeSprites } from "@/lib/decks/archetype";
import { createPublicClient } from "@/lib/supabase/public";
import type { CompetitiveDeckResult, CompetitiveDeckStats } from "@/types/index";

const COMPETITIVE_DATA_SAMPLE_DAYS = 7;
const COMPETITIVE_DATA_CACHE_VERSION = "v4";
const COMPETITIVE_DATA_REVALIDATE_SECONDS = 60 * 10;

type CompetitiveArchetypeSnapshotRow = {
  archetype_id: string;
  sample_days: number;
  appearance_count: number;
  best_finish: number | null;
  top_cut_count: number;
  results: unknown;
  source: "limitless";
  synced_at: string;
};

function parseCompetitiveResults(value: unknown): CompetitiveDeckResult[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
    .map((entry) => ({
      tournamentId: String(entry.tournamentId || "").trim(),
      tournamentName: String(entry.tournamentName || "").trim(),
      tournamentDate: String(entry.tournamentDate || "").trim(),
      tournamentPlayers: Number(entry.tournamentPlayers || 0),
      playerId: String(entry.playerId || "").trim(),
      playerName: String(entry.playerName || "").trim(),
      placing: Number(entry.placing || 0),
      wins: Number(entry.wins || 0),
      losses: Number(entry.losses || 0),
      ties: Number(entry.ties || 0),
      decklistUrl: String(entry.decklistUrl || "").trim()
    }))
    .filter(
      (entry) =>
        entry.tournamentId &&
        entry.tournamentName &&
        entry.tournamentDate &&
        entry.playerId &&
        entry.playerName &&
        entry.placing > 0 &&
        entry.decklistUrl
    );
}

const getDeckCompetitiveStatsCached = unstable_cache(
  async (archetypeId: string): Promise<CompetitiveDeckStats> => {
    const normalizedArchetypeId = String(archetypeId || "").trim().toLowerCase();

    if (!normalizedArchetypeId) {
      return {
        archetypeId: normalizedArchetypeId,
        sampleDays: COMPETITIVE_DATA_SAMPLE_DAYS,
        appearanceCount: 0,
        bestFinish: undefined,
        topCutCount: 0,
        results: [],
        syncedAt: undefined,
        source: "limitless",
        status: "empty"
      };
    }

    try {
      const supabase = createPublicClient();
      const { data, error } = await supabase
        .from("competitive_archetype_snapshots")
        .select(
          [
            "archetype_id",
            "sample_days",
            "appearance_count",
            "best_finish",
            "top_cut_count",
            "results",
            "source",
            "synced_at"
          ].join(",")
        )
        .eq("archetype_id", normalizedArchetypeId)
        .eq("sample_days", COMPETITIVE_DATA_SAMPLE_DAYS)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        return {
          archetypeId: normalizedArchetypeId,
          sampleDays: COMPETITIVE_DATA_SAMPLE_DAYS,
          appearanceCount: 0,
          bestFinish: undefined,
          topCutCount: 0,
          results: [],
          syncedAt: undefined,
          source: "limitless",
          status: "empty"
        };
      }

      const row = (data as unknown) as CompetitiveArchetypeSnapshotRow;
      return {
        archetypeId: row.archetype_id,
        sampleDays: row.sample_days,
        appearanceCount: row.appearance_count,
        bestFinish: row.best_finish ?? undefined,
        topCutCount: row.top_cut_count,
        results: parseCompetitiveResults(row.results),
        syncedAt: row.synced_at || undefined,
        source: row.source,
        status: row.appearance_count > 0 ? "ok" : "empty"
      };
    } catch {
      return {
        archetypeId: normalizedArchetypeId,
        sampleDays: COMPETITIVE_DATA_SAMPLE_DAYS,
        appearanceCount: 0,
        bestFinish: undefined,
        topCutCount: 0,
        results: [],
        syncedAt: undefined,
        source: "limitless",
        status: "unavailable"
      };
    }
  },
  ["deck-competitive-stats", COMPETITIVE_DATA_CACHE_VERSION],
  {
    revalidate: COMPETITIVE_DATA_REVALIDATE_SECONDS
  }
);

export async function getDeckCompetitiveStats(
  deckPokemon: string[]
): Promise<CompetitiveDeckStats> {
  const archetypeId = buildDeckArchetypeId(normalizeDeckArchetypeSprites(deckPokemon));
  return await getDeckCompetitiveStatsCached(archetypeId);
}
