import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getDecks } from "@/lib/db/decks";
import { measureServerCall } from "@/lib/server/perf";
import type { DeckSummary, Tournament, TournamentRound, TournamentSummary } from "@/types/index";

type PostgrestLikeError = {
  code?: string | null;
  message?: string | null;
};

type TournamentRow = {
  id: string;
  user_id: string;
  name: string;
  date_from: string;
  date_to: string;
  linked_deck_id: string | null;
  deck_name: string;
  deck_sprites: unknown;
  category: Tournament["category"];
  placement: Tournament["placement"];
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

function parseSpriteArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function mapTournamentRow(row: TournamentRow): Tournament {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    dateFrom: row.date_from,
    dateTo: row.date_to,
    linkedDeckId: row.linked_deck_id ?? undefined,
    deckName: row.deck_name,
    deckSprites: parseSpriteArray(row.deck_sprites),
    category: row.category || "",
    placement: row.placement || "",
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

export class TournamentSchemaMissingError extends Error {
  constructor() {
    super("Tournament tables are not available in the current Supabase schema yet.");
    this.name = "TournamentSchemaMissingError";
  }
}

function rethrowIfSchemaMissing(error: PostgrestLikeError | null) {
  if (error?.code === "PGRST205") {
    throw new TournamentSchemaMissingError();
  }
}

export const getTournaments = cache(async (userId: string): Promise<Tournament[]> => {
  const supabase = createClient();
  const { data, error } = await measureServerCall("db.tournaments.list", async () =>
    await supabase
      .from("tournaments")
      .select(
        [
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
        ].join(",")
      )
      .eq("user_id", userId)
      .order("date_from", { ascending: false })
      .order("created_at", { ascending: false })
  );

  if (error) {
    rethrowIfSchemaMissing(error);
    throw error;
  }

  return (((data ?? []) as unknown) as TournamentRow[]).map(mapTournamentRow);
});

export const getTournamentRounds = cache(
  async (userId: string, tournamentId: string): Promise<TournamentRound[]> => {
    const supabase = createClient();
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
    const supabase = createClient();
    const { data, error } = await measureServerCall("db.tournaments.detail", async () =>
      await supabase
        .from("tournaments")
        .select(
          [
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
          ].join(",")
        )
        .eq("user_id", userId)
        .eq("id", tournamentId)
        .maybeSingle()
    );

    if (error) {
      rethrowIfSchemaMissing(error);
      throw error;
    }

    if (!data) {
      return null;
    }

    return mapTournamentRow((data as unknown) as TournamentRow);
  }
);

export async function getTournamentSummaryById(
  userId: string,
  tournamentId: string
): Promise<TournamentSummary | null> {
  const [tournament, rounds] = await Promise.all([
    getTournamentById(userId, tournamentId),
    getTournamentRounds(userId, tournamentId)
  ]);

  if (!tournament) {
    return null;
  }

  return {
    ...tournament,
    rounds
  };
}

export async function getTournamentSummaries(userId: string): Promise<TournamentSummary[]> {
  const [tournaments, rounds] = await Promise.all([
    getTournaments(userId),
    getAllTournamentRoundsForUser(userId)
  ]);

  return tournaments.map((tournament) => ({
    ...tournament,
    rounds: rounds.filter((round) => round.tournamentId === tournament.id)
  }));
}

export async function getTournamentDeckChoices(userId: string): Promise<DeckSummary[]> {
  return await getDecks(userId);
}

async function getAllTournamentRoundsForUser(userId: string) {
  const supabase = createClient();
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
