import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { measureServerCall } from "@/lib/server/perf";
import type {
  Tournament,
  TournamentDeckListSnapshot,
  TournamentRound,
  TournamentSummary
} from "@/types/index";

type PostgrestLikeError = {
  code?: string | null;
  message?: string | null;
};

const TOURNAMENT_BASE_SELECT = [
  "id",
  "user_id",
  "name",
  "date_from",
  "date_to",
  "linked_deck_id",
  "deck_name",
  "deck_sprites",
  "category",
  "placement",
  "format",
  "notes",
  "created_at",
  "updated_at"
].join(",");

const TOURNAMENT_EXTENDED_SELECT = [
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
].join(",");

const TOURNAMENT_PARTICIPATION_SELECT = [
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
  "participation",
  "judge_role",
  "format",
  "notes",
  "created_at",
  "updated_at"
].join(",");

const TOURNAMENT_EVENT_DETAILS_SELECT = [
  "id",
  "user_id",
  "name",
  "tournament_identifier",
  "location",
  "championship_points",
  "professor_points",
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
].join(",");

const TOURNAMENT_CHAMPIONSHIP_POINTS_SELECT = TOURNAMENT_EVENT_DETAILS_SELECT
  .split(",")
  .filter((column) => column !== "professor_points")
  .join(",");

type TournamentRow = {
  id: string;
  user_id: string;
  name: string;
  tournament_identifier?: string;
  location?: string;
  championship_points?: number | null;
  professor_points?: number | null;
  date_from: string;
  date_to: string;
  linked_deck_id: string | null;
  linked_deck_list_id: string | null;
  deck_name: string;
  deck_sprites: unknown;
  category: Tournament["category"];
  placement: Tournament["placement"];
  participation?: Tournament["participation"];
  judge_role?: Tournament["judgeRole"] | null;
  format: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

type TournamentRoundRow = {
  id: string;
  tournament_id: string;
  user_id: string;
  round_number: number;
  opponent_deck_name: string;
  opponent_deck_sprites: unknown;
  result: TournamentRound["result"];
  notes: string;
  created_at: string;
  updated_at: string;
};

type TournamentDeckListSnapshotRow = {
  id: string;
  tournament_id: string;
  user_id: string;
  source_deck_id: string | null;
  source_deck_list_id: string | null;
  request_id: string;
  payload_hash: string;
  name: string;
  format: string;
  date: string;
  created_by: string;
  notes: string;
  raw_list: string;
  parsed_cards: unknown;
  sorted_cards: unknown;
  sorted_cards_version: number;
  created_at: string;
};

function parseSpriteArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function isMissingTournamentDeckListColumns(error: PostgrestLikeError | null) {
  return error?.code === "42703";
}

function isMissingTournamentProfessorPointsColumn(error: PostgrestLikeError | null) {
  return (
    ["42703", "PGRST204"].includes(String(error?.code || "")) &&
    /professor_points/i.test(String(error?.message || ""))
  );
}

function mapTournamentRow(row: TournamentRow): Tournament {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    tournamentIdentifier: row.tournament_identifier || "",
    location: row.location || "",
    championshipPoints:
      row.participation === "judge" ? null : (row.championship_points ?? null),
    professorPoints:
      row.participation === "judge"
        ? (row.professor_points ?? row.championship_points ?? null)
        : null,
    dateFrom: row.date_from,
    dateTo: row.date_to,
    linkedDeckId: row.linked_deck_id ?? undefined,
    linkedDeckListId: row.linked_deck_list_id ?? undefined,
    deckName: row.deck_name,
    deckSprites: parseSpriteArray(row.deck_sprites),
    category: row.category || "",
    placement: row.placement || "",
    participation: row.participation === "judge" ? "judge" : "player",
    judgeRole:
      row.participation === "judge" && row.judge_role === "head judge"
        ? "head judge"
        : row.participation === "judge"
          ? "judge"
          : "",
    format: row.format,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapTournamentRoundRow(row: TournamentRoundRow): TournamentRound {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    userId: row.user_id,
    roundNumber: row.round_number,
    opponentDeckName: row.opponent_deck_name,
    opponentDeckSprites: parseSpriteArray(row.opponent_deck_sprites),
    result: row.result,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapTournamentDeckListSnapshotRow(
  row: TournamentDeckListSnapshotRow
): TournamentDeckListSnapshot {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    userId: row.user_id,
    sourceDeckId: row.source_deck_id,
    sourceDeckListId: row.source_deck_list_id,
    requestId: row.request_id,
    payloadHash: row.payload_hash,
    name: row.name,
    format: row.format,
    date: row.date,
    createdBy: row.created_by,
    notes: row.notes,
    rawList: row.raw_list,
    parsedCards: (Array.isArray(row.parsed_cards) ? row.parsed_cards : []) as TournamentDeckListSnapshot["parsedCards"],
    sortedCards: (Array.isArray(row.sorted_cards) ? row.sorted_cards : []) as TournamentDeckListSnapshot["sortedCards"],
    sortedCardsVersion: row.sorted_cards_version,
    createdAt: row.created_at
  };
}

export class TournamentSchemaMissingError extends Error {
  constructor() {
    super("Tournament tables are missing from the current Supabase schema.");
    this.name = "TournamentSchemaMissingError";
  }
}

function rethrowIfSchemaMissing(error: PostgrestLikeError | null) {
  if (error?.code === "PGRST205") {
    throw new TournamentSchemaMissingError();
  }
}

export function unwrapTournamentSnapshotQueryResult<T>(result: {
  data: T | null;
  error: PostgrestLikeError | null;
}): T | null {
  rethrowIfSchemaMissing(result.error);
  if (result.error) {
    throw result.error;
  }
  return result.data;
}

const getTournaments = cache(async (userId: string): Promise<Tournament[]> => {
  const supabase = await createClient();
  let { data, error } = await measureServerCall("db.tournaments.list", async () =>
    await supabase
      .from("tournaments")
      .select(TOURNAMENT_EVENT_DETAILS_SELECT)
      .eq("user_id", userId)
      .order("date_from", { ascending: false })
      .order("created_at", { ascending: false })
  );

  if (isMissingTournamentProfessorPointsColumn(error)) {
    ({ data, error } = await measureServerCall("db.tournaments.list.preProfessorPoints", async () =>
      await supabase
        .from("tournaments")
        .select(TOURNAMENT_CHAMPIONSHIP_POINTS_SELECT)
        .eq("user_id", userId)
        .order("date_from", { ascending: false })
        .order("created_at", { ascending: false })
    ));
  }

  if (isMissingTournamentDeckListColumns(error)) {
    ({ data, error } = await measureServerCall("db.tournaments.list.preEventDetails", async () =>
      await supabase
        .from("tournaments")
        .select(TOURNAMENT_PARTICIPATION_SELECT)
        .eq("user_id", userId)
        .order("date_from", { ascending: false })
        .order("created_at", { ascending: false })
    ));
  }

  if (isMissingTournamentDeckListColumns(error)) {
    ({ data, error } = await measureServerCall("db.tournaments.list.preParticipation", async () =>
      await supabase
        .from("tournaments")
        .select(TOURNAMENT_EXTENDED_SELECT)
        .eq("user_id", userId)
        .order("date_from", { ascending: false })
        .order("created_at", { ascending: false })
    ));
  }

  if (isMissingTournamentDeckListColumns(error)) {
    ({ data, error } = await measureServerCall("db.tournaments.list.legacy", async () =>
      await supabase
        .from("tournaments")
        .select(TOURNAMENT_BASE_SELECT)
        .eq("user_id", userId)
        .order("date_from", { ascending: false })
        .order("created_at", { ascending: false })
    ));
  }

  if (error) {
    rethrowIfSchemaMissing(error);
    throw error;
  }

  return (((data ?? []) as unknown) as TournamentRow[]).map(mapTournamentRow);
});

export const getTournamentRounds = cache(
  async (userId: string, tournamentId: string): Promise<TournamentRound[]> => {
    const supabase = await createClient();
    const { data, error } = await measureServerCall("db.tournaments.rounds", async () =>
      await supabase
        .from("tournament_rounds")
        .select(
          [
            "id",
            "tournament_id",
            "user_id",
            "round_number",
            "opponent_deck_name",
            "opponent_deck_sprites",
            "result",
            "notes",
            "created_at",
            "updated_at"
          ].join(",")
        )
        .eq("user_id", userId)
        .eq("tournament_id", tournamentId)
        .order("round_number", { ascending: true })
    );

    if (error) {
      rethrowIfSchemaMissing(error);
      throw error;
    }

    return (((data ?? []) as unknown) as TournamentRoundRow[]).map(mapTournamentRoundRow);
  }
);

export const getTournamentById = cache(
  async (userId: string, tournamentId: string): Promise<Tournament | null> => {
    const supabase = await createClient();
    let { data, error } = await measureServerCall("db.tournaments.detail", async () =>
      await supabase
        .from("tournaments")
        .select(TOURNAMENT_EVENT_DETAILS_SELECT)
        .eq("user_id", userId)
        .eq("id", tournamentId)
        .maybeSingle()
    );

    if (isMissingTournamentProfessorPointsColumn(error)) {
      ({ data, error } = await measureServerCall(
        "db.tournaments.detail.preProfessorPoints",
        async () =>
          await supabase
            .from("tournaments")
            .select(TOURNAMENT_CHAMPIONSHIP_POINTS_SELECT)
            .eq("user_id", userId)
            .eq("id", tournamentId)
            .maybeSingle()
      ));
    }

    if (isMissingTournamentDeckListColumns(error)) {
      ({ data, error } = await measureServerCall("db.tournaments.detail.preEventDetails", async () =>
        await supabase
          .from("tournaments")
          .select(TOURNAMENT_PARTICIPATION_SELECT)
          .eq("user_id", userId)
          .eq("id", tournamentId)
          .maybeSingle()
      ));
    }

    if (isMissingTournamentDeckListColumns(error)) {
      ({ data, error } = await measureServerCall("db.tournaments.detail.preParticipation", async () =>
        await supabase
          .from("tournaments")
          .select(TOURNAMENT_EXTENDED_SELECT)
          .eq("user_id", userId)
          .eq("id", tournamentId)
          .maybeSingle()
      ));
    }

    if (isMissingTournamentDeckListColumns(error)) {
      ({ data, error } = await measureServerCall("db.tournaments.detail.legacy", async () =>
        await supabase
          .from("tournaments")
          .select(TOURNAMENT_BASE_SELECT)
          .eq("user_id", userId)
          .eq("id", tournamentId)
          .maybeSingle()
      ));
    }

    if (error) {
      rethrowIfSchemaMissing(error);
      throw error;
    }

    if (!data) {
      return null;
    }

    const tournament = mapTournamentRow((data as unknown) as TournamentRow);
    const snapshotResult = await measureServerCall(
      "db.tournaments.detail.snapshot",
      async () => await supabase
        .from("tournament_deck_list_snapshots")
        .select("id,tournament_id,user_id,source_deck_id,source_deck_list_id,request_id,payload_hash,name,format,date,created_by,notes,raw_list,parsed_cards,sorted_cards,sorted_cards_version,created_at")
        .eq("user_id", userId)
        .eq("tournament_id", tournamentId)
        .maybeSingle()
    );

    const snapshotData = unwrapTournamentSnapshotQueryResult(snapshotResult);
    if (snapshotData) {
      tournament.deckListSnapshot = mapTournamentDeckListSnapshotRow(
        snapshotData as TournamentDeckListSnapshotRow
      );
    }

    return tournament;
  }
);

export async function getTournamentSummaries(userId: string): Promise<TournamentSummary[]> {
  const [tournaments, rounds] = await Promise.all([
    getTournaments(userId),
    getAllTournamentRoundsForUser(userId)
  ]);

  const roundsByTournamentId = new Map<string, TournamentRound[]>();

  for (const round of rounds) {
    const existingRounds = roundsByTournamentId.get(round.tournamentId);

    if (existingRounds) {
      existingRounds.push(round);
      continue;
    }

    roundsByTournamentId.set(round.tournamentId, [round]);
  }

  return tournaments.map((tournament) => ({
    ...tournament,
    rounds: roundsByTournamentId.get(tournament.id) ?? []
  }));
}

async function getAllTournamentRoundsForUser(userId: string) {
  const supabase = await createClient();
  const { data, error } = await measureServerCall("db.tournaments.roundsAll", async () =>
    await supabase
      .from("tournament_rounds")
      .select(
        [
          "id",
          "tournament_id",
          "user_id",
          "round_number",
          "opponent_deck_name",
          "opponent_deck_sprites",
          "result",
          "notes",
          "created_at",
          "updated_at"
        ].join(",")
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
  );

  if (error) {
    rethrowIfSchemaMissing(error);
    throw error;
  }

  return (((data ?? []) as unknown) as TournamentRoundRow[]).map(mapTournamentRoundRow);
}
