import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const REQUIRED_ENV_VARS = ["NEW_SUPABASE_URL", "NEW_SUPABASE_SERVICE_KEY"];
const LIMITLESS_API_BASE_URL = "https://play.limitlesstcg.com/api";
const LIMITLESS_TOURNAMENT_BASE_URL = "https://play.limitlesstcg.com/tournament";
const SYNC_KEY = "limitless-ptcg-standard";
const SAMPLE_DAYS = 7;
const TOURNAMENTS_PER_PAGE = 20;
const RESULT_LIMIT = 5;
const REQUEST_DELAY_MS = 1500;
const MINIMUM_TOURNAMENT_PLAYERS = 20;
const MAX_TOURNAMENTS_PER_RUN = 10;
const PROCESSED_RETENTION_DAYS = 30;

for (const envVar of REQUIRED_ENV_VARS) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

const supabase = createClient(
  process.env.NEW_SUPABASE_URL,
  process.env.NEW_SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeDeckArchetypeSprites(values) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right));
}

function buildDeckArchetypeId(values) {
  return normalizeDeckArchetypeSprites(values).join("+");
}

function hasPublicDecklist(value) {
  return value && typeof value === "object" && Object.keys(value).length > 0;
}

function buildDecklistUrl(tournamentId, playerId) {
  return `${LIMITLESS_TOURNAMENT_BASE_URL}/${tournamentId}/player/${playerId}/decklist`;
}

function getSampleWindowStart() {
  const windowStart = new Date();
  windowStart.setUTCHours(0, 0, 0, 0);
  windowStart.setUTCDate(windowStart.getUTCDate() - (SAMPLE_DAYS - 1));
  return windowStart;
}

function getProcessedRetentionStart() {
  const retentionStart = new Date();
  retentionStart.setUTCHours(0, 0, 0, 0);
  retentionStart.setUTCDate(retentionStart.getUTCDate() - (PROCESSED_RETENTION_DAYS - 1));
  return retentionStart;
}

function sortCompetitiveResults(left, right) {
  if (left.placing !== right.placing) {
    return left.placing - right.placing;
  }

  if (left.tournamentPlayers !== right.tournamentPlayers) {
    return right.tournamentPlayers - left.tournamentPlayers;
  }

  if (left.wins !== right.wins) {
    return right.wins - left.wins;
  }

  return right.tournamentDate.localeCompare(left.tournamentDate);
}

function sortTournamentsByDate(left, right) {
  return Date.parse(String(right?.date || "")) - Date.parse(String(left?.date || ""));
}

async function fetchLimitlessJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Poke Notes Competitive Sync"
    }
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Limitless request failed (${response.status}): ${text.slice(0, 200)}`);
  }

  return JSON.parse(text);
}

async function fetchTournamentPage(page) {
  const payload = await fetchLimitlessJson(
    `${LIMITLESS_API_BASE_URL}/tournaments?game=PTCG&format=STANDARD&limit=${TOURNAMENTS_PER_PAGE}&page=${page}`
  );

  return Array.isArray(payload) ? payload : [];
}

async function fetchTournamentStandings(tournamentId) {
  return await fetchLimitlessJson(`${LIMITLESS_API_BASE_URL}/tournaments/${tournamentId}/standings`);
}

async function loadSyncState() {
  const { data, error } = await supabase
    .from("competitive_sync_state")
    .select("sync_key,next_backfill_page,last_run_at,last_status,last_error")
    .eq("sync_key", SYNC_KEY)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load sync state: ${error.message}`);
  }

  return data ?? {
    sync_key: SYNC_KEY,
    next_backfill_page: 2,
    last_run_at: null,
    last_status: "idle",
    last_error: ""
  };
}

async function saveSyncState(input) {
  const { error } = await supabase.from("competitive_sync_state").upsert(input, {
    onConflict: "sync_key"
  });

  if (error) {
    throw new Error(`Failed to save sync state: ${error.message}`);
  }
}

async function loadProcessedTournamentIds() {
  const retentionStartIso = getProcessedRetentionStart().toISOString();
  const { data, error } = await supabase
    .from("competitive_processed_tournaments")
    .select("tournament_id")
    .gte("tournament_date", retentionStartIso);

  if (error) {
    throw new Error(`Failed to load processed tournament ids: ${error.message}`);
  }

  return new Set(
    (Array.isArray(data) ? data : [])
      .map((row) => String(row.tournament_id || "").trim())
      .filter(Boolean)
  );
}

function collectEligibleTournaments(pages) {
  const sampleWindowStart = getSampleWindowStart().getTime();
  const seenTournamentIds = new Set();
  const eligibleTournaments = [];
  let backfillPageHasInWindowTournaments = false;

  pages.forEach(({ page, tournaments }) => {
    tournaments.forEach((tournament) => {
      const id = String(tournament?.id || "").trim();
      const date = String(tournament?.date || "").trim();
      const players = Number(tournament?.players || 0);

      if (!id || !date || seenTournamentIds.has(id)) {
        return;
      }

      const tournamentTime = Date.parse(date);
      if (!Number.isFinite(tournamentTime) || tournamentTime < sampleWindowStart) {
        return;
      }

      if (page > 1) {
        backfillPageHasInWindowTournaments = true;
      }

      if (players < MINIMUM_TOURNAMENT_PLAYERS) {
        return;
      }

      seenTournamentIds.add(id);
      eligibleTournaments.push(tournament);
    });
  });

  return {
    eligibleTournaments,
    backfillPageHasInWindowTournaments
  };
}

function buildResultRows(tournament, standings) {
  const tournamentId = String(tournament?.id || "").trim();
  const tournamentName = String(tournament?.name || "").trim();
  const tournamentDate = String(tournament?.date || "").trim();
  const tournamentPlayers = Number(tournament?.players || 0);
  const syncedAt = new Date().toISOString();

  return (Array.isArray(standings) ? standings : [])
    .map((standing) => {
      const playerId = String(standing?.player || "").trim();
      const playerName = String(standing?.name || "").trim();
      const placing = Number(standing?.placing || 0);
      const icons = normalizeDeckArchetypeSprites(
        Array.isArray(standing?.deck?.icons) ? standing.deck.icons : []
      );

      if (!playerId || !playerName || !Number.isFinite(placing) || placing <= 0 || icons.length === 0) {
        return null;
      }

      if (!hasPublicDecklist(standing?.decklist)) {
        return null;
      }

      const archetypeId = buildDeckArchetypeId(icons);
      if (!archetypeId) {
        return null;
      }

      return {
        tournament_id: tournamentId,
        archetype_id: archetypeId,
        tournament_name: tournamentName,
        tournament_date: tournamentDate,
        tournament_players: tournamentPlayers,
        player_id: playerId,
        player_name: playerName,
        finish_placing: placing,
        wins: Number(standing?.record?.wins || 0),
        losses: Number(standing?.record?.losses || 0),
        ties: Number(standing?.record?.ties || 0),
        decklist_url: buildDecklistUrl(tournamentId, playerId),
        source: "limitless",
        synced_at: syncedAt
      };
    })
    .filter(Boolean);
}

async function upsertResultRows(rows) {
  if (rows.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("competitive_tournament_results")
    .upsert(rows, { onConflict: "tournament_id,player_id" });

  if (error) {
    throw new Error(`Failed to upsert tournament result rows: ${error.message}`);
  }
}

async function markTournamentsProcessed(tournaments) {
  if (tournaments.length === 0) {
    return;
  }

  const rows = tournaments.map((tournament) => ({
    tournament_id: String(tournament?.id || "").trim(),
    tournament_date: String(tournament?.date || "").trim(),
    tournament_players: Number(tournament?.players || 0),
    processed_at: new Date().toISOString(),
    source: "limitless"
  }));

  const { error } = await supabase
    .from("competitive_processed_tournaments")
    .upsert(rows, { onConflict: "tournament_id" });

  if (error) {
    throw new Error(`Failed to mark tournaments processed: ${error.message}`);
  }
}

async function cleanupExpiredCompetitiveRows() {
  const retentionStartIso = getProcessedRetentionStart().toISOString();

  const [{ error: resultsError }, { error: tournamentsError }] = await Promise.all([
    supabase
      .from("competitive_tournament_results")
      .delete()
      .lt("tournament_date", retentionStartIso),
    supabase
      .from("competitive_processed_tournaments")
      .delete()
      .lt("tournament_date", retentionStartIso)
  ]);

  if (resultsError) {
    throw new Error(`Failed to delete expired tournament results: ${resultsError.message}`);
  }

  if (tournamentsError) {
    throw new Error(`Failed to delete expired processed tournaments: ${tournamentsError.message}`);
  }
}

async function rebuildCompetitiveSnapshots() {
  const sampleWindowStartIso = getSampleWindowStart().toISOString();
  const { data, error } = await supabase
    .from("competitive_tournament_results")
    .select(
      [
        "tournament_id",
        "archetype_id",
        "tournament_name",
        "tournament_date",
        "tournament_players",
        "player_id",
        "player_name",
        "finish_placing",
        "wins",
        "losses",
        "ties",
        "decklist_url"
      ].join(",")
    )
    .gte("tournament_date", sampleWindowStartIso)
    .order("tournament_date", { ascending: false });

  if (error) {
    throw new Error(`Failed to load tournament results for snapshots: ${error.message}`);
  }

  const groupedResults = new Map();
  (Array.isArray(data) ? data : []).forEach((row) => {
    const archetypeId = String(row.archetype_id || "").trim();
    if (!archetypeId) {
      return;
    }

    const currentResults = groupedResults.get(archetypeId) ?? [];
    currentResults.push({
      tournamentId: String(row.tournament_id || "").trim(),
      tournamentName: String(row.tournament_name || "").trim(),
      tournamentDate: String(row.tournament_date || "").trim(),
      tournamentPlayers: Number(row.tournament_players || 0),
      playerId: String(row.player_id || "").trim(),
      playerName: String(row.player_name || "").trim(),
      placing: Number(row.finish_placing || 0),
      wins: Number(row.wins || 0),
      losses: Number(row.losses || 0),
      ties: Number(row.ties || 0),
      decklistUrl: String(row.decklist_url || "").trim()
    });
    groupedResults.set(archetypeId, currentResults);
  });

  const syncedAt = new Date().toISOString();
  const rows = Array.from(groupedResults.entries()).map(([archetypeId, results]) => {
    const sortedResults = [...results].sort(sortCompetitiveResults);
    return {
      archetype_id: archetypeId,
      sample_days: SAMPLE_DAYS,
      appearance_count: sortedResults.length,
      best_finish: sortedResults[0]?.placing ?? null,
      top_cut_count: sortedResults.filter((result) => result.placing <= 8).length,
      results: sortedResults.slice(0, RESULT_LIMIT),
      source: "limitless",
      synced_at: syncedAt
    };
  });

  const { error: deleteError } = await supabase
    .from("competitive_archetype_snapshots")
    .delete()
    .eq("sample_days", SAMPLE_DAYS);

  if (deleteError) {
    throw new Error(`Failed to clear competitive snapshots: ${deleteError.message}`);
  }

  if (rows.length > 0) {
    const { error: insertError } = await supabase
      .from("competitive_archetype_snapshots")
      .insert(rows);

    if (insertError) {
      throw new Error(`Failed to rebuild competitive snapshots: ${insertError.message}`);
    }
  }

  return rows.length;
}

async function runSync() {
  const syncState = await loadSyncState();
  const backfillPage = Math.max(Number(syncState.next_backfill_page || 2), 2);
  const pagesToFetch = backfillPage === 1 ? [1] : [1, backfillPage];

  console.log(`Fetching tournament pages ${pagesToFetch.join(", ")}...`);
  const pageResults = [];
  for (const page of pagesToFetch) {
    const tournaments = await fetchTournamentPage(page);
    pageResults.push({ page, tournaments });
    await sleep(REQUEST_DELAY_MS);
  }

  const { eligibleTournaments, backfillPageHasInWindowTournaments } = collectEligibleTournaments(
    pageResults
  );
  const processedTournamentIds = await loadProcessedTournamentIds();
  const tournamentsToProcess = eligibleTournaments
    .filter((tournament) => !processedTournamentIds.has(String(tournament?.id || "").trim()))
    .sort(sortTournamentsByDate)
    .slice(0, MAX_TOURNAMENTS_PER_RUN);

  console.log(
    `Eligible tournaments this run: ${eligibleTournaments.length}. New tournaments to process: ${tournamentsToProcess.length}.`
  );

  const processedThisRun = [];
  for (const tournament of tournamentsToProcess) {
    const tournamentId = String(tournament?.id || "").trim();
    console.log(`Fetching standings for ${tournamentId} (${tournament?.name || "Unknown"})...`);
    const standings = await fetchTournamentStandings(tournamentId);
    const resultRows = buildResultRows(tournament, standings);
    await upsertResultRows(resultRows);
    processedThisRun.push(tournament);
    await sleep(REQUEST_DELAY_MS);
  }

  await markTournamentsProcessed(processedThisRun);
  await cleanupExpiredCompetitiveRows();
  const snapshotCount = await rebuildCompetitiveSnapshots();

  const nextBackfillPage = backfillPageHasInWindowTournaments ? backfillPage + 1 : 2;
  await saveSyncState({
    sync_key: SYNC_KEY,
    next_backfill_page: nextBackfillPage,
    last_run_at: new Date().toISOString(),
    last_status: "ok",
    last_error: ""
  });

  console.log(
    `Sync complete. Processed ${processedThisRun.length} tournaments this run. Rebuilt ${snapshotCount} snapshot rows. Next backfill page: ${nextBackfillPage}.`
  );
}

async function main() {
  try {
    await runSync();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    try {
      const syncState = await loadSyncState();
      await saveSyncState({
        sync_key: SYNC_KEY,
        next_backfill_page: Math.max(Number(syncState.next_backfill_page || 2), 2),
        last_run_at: new Date().toISOString(),
        last_status: "error",
        last_error: message
      });
    } catch {
      // Preserve the original failure below.
    }

    console.error(message);
    process.exit(1);
  }
}

main();
