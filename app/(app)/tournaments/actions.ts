"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { isKnownSiteFormat } from "@/lib/formats/options";
import { createClient } from "@/lib/supabase/server";
import {
  TOURNAMENT_CATEGORY_OPTIONS,
  TOURNAMENT_PLACEMENT_OPTIONS,
  TOURNAMENT_ROUND_GAME_RESULT_OPTIONS
} from "@/lib/tournaments/options";
import type {
  TournamentCategory,
  TournamentPlacement,
  TournamentRoundGameResult,
  TournamentRoundResult
} from "@/types/index";

type SaveActionResult = {
  ok: true;
  redirectTo: string;
};

type PostgrestLikeError = {
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  message?: string | null;
};

function revalidateTournamentWorkspace(tournamentId?: string) {
  revalidatePath("/tournaments", "layout");
  if (tournamentId) {
    revalidatePath(`/tournaments/${tournamentId}`);
  }
}

function getRedirectTarget(formData: FormData, fallbackPath: string) {
  return String(formData.get("redirectTo") || "").trim() || fallbackPath;
}

function withRefreshToken(path: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}r=${Date.now()}`;
}

function toUserFacingDatabaseError(error: PostgrestLikeError) {
  if (error.code === "23514") {
    return new Error(
      "Your Supabase tournament round constraint is out of date. Run the latest tournament rounds SQL update, then try again."
    );
  }

  if (error.message) {
    return new Error(error.message);
  }

  return new Error("A database error occurred while saving.");
}

function parseCategory(value: FormDataEntryValue | null): TournamentCategory {
  const normalized = String(value || "").trim();
  return TOURNAMENT_CATEGORY_OPTIONS.some((option) => option.value === normalized)
    ? (normalized as TournamentCategory)
    : "";
}

function parsePlacement(value: FormDataEntryValue | null): TournamentPlacement {
  const normalized = String(value || "").trim();
  return TOURNAMENT_PLACEMENT_OPTIONS.some((option) => option.value === normalized)
    ? (normalized as TournamentPlacement)
    : "";
}

function parseRoundGameResult(value: FormDataEntryValue | null): "" | TournamentRoundGameResult {
  const normalized = String(value || "").trim();
  return TOURNAMENT_ROUND_GAME_RESULT_OPTIONS.includes(normalized as TournamentRoundGameResult)
    ? (normalized as TournamentRoundGameResult)
    : "";
}

function buildTournamentRoundResult(gameResults: TournamentRoundGameResult[]): TournamentRoundResult {
  if (gameResults.length === 1) {
    return gameResults[0];
  }

  if (gameResults.length === 2) {
    return `${gameResults[0]}${gameResults[1]}`;
  }

  return `${gameResults[0]}${gameResults[1]}${gameResults[2]}`;
}

function parseRoundResult(formData: FormData): TournamentRoundResult {
  const isBye = String(formData.get("isBye") || "").trim();
  if (isBye) {
    return "BYE";
  }

  const selectedGameResults = [
    parseRoundGameResult(formData.get("game1")),
    parseRoundGameResult(formData.get("game2")),
    parseRoundGameResult(formData.get("game3"))
  ].filter((result): result is TournamentRoundGameResult => Boolean(result));

  if (selectedGameResults.length > 0) {
    return buildTournamentRoundResult(selectedGameResults);
  }

  throw new Error("Choose at least one game result or mark the round as BYE.");
}

function parseFormat(value: FormDataEntryValue | null) {
  const normalized = String(value || "").trim();
  return normalized;
}

function parseSpriteArray(values: FormDataEntryValue[]) {
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .slice(0, 2);
}

function parseIsoDate(value: FormDataEntryValue | null, fallback?: string) {
  const normalized = String(value || "").trim() || String(fallback || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error("Choose a valid date.");
  }

  return normalized;
}

async function resolveDeckSnapshot(userId: string, linkedDeckId: string) {
  if (!linkedDeckId) {
    return null;
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("decks")
    .select("id,deck_name,deck_pokemon")
    .eq("id", linkedDeckId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    linkedDeckId: data.id as string,
    deckName: String((data as { deck_name?: string }).deck_name || "").trim(),
    deckSprites: Array.isArray((data as { deck_pokemon?: unknown }).deck_pokemon)
      ? ((data as { deck_pokemon: unknown[] }).deck_pokemon.filter(
          (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
        ))
      : []
  };
}

async function resolveTournamentRoundNumber(params: {
  roundId: string;
  tournamentId: string;
  userId: string;
}) {
  const supabase = createClient();

  if (params.roundId) {
    const { data, error } = await supabase
      .from("tournament_rounds")
      .select("round_number")
      .eq("id", params.roundId)
      .eq("tournament_id", params.tournamentId)
      .eq("user_id", params.userId)
      .maybeSingle();

    if (error) {
      throw toUserFacingDatabaseError(error);
    }

    if (!data?.round_number) {
      throw new Error("Could not find that round.");
    }

    return Number(data.round_number);
  }

  const { data, error } = await supabase
    .from("tournament_rounds")
    .select("round_number")
    .eq("tournament_id", params.tournamentId)
    .eq("user_id", params.userId)
    .order("round_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw toUserFacingDatabaseError(error);
  }

  return Number(data?.round_number || 0) + 1;
}

export async function createTournamentAction(formData: FormData): Promise<SaveActionResult> {
  const user = await requireUser();
  const supabase = createClient();
  const linkedDeckId = String(formData.get("linkedDeckId") || "").trim();
  const resolvedDeck = await resolveDeckSnapshot(user.id, linkedDeckId);
  const name = String(formData.get("name") || "").trim();
  const dateFrom = parseIsoDate(formData.get("dateFrom"));
  const dateTo = parseIsoDate(formData.get("dateTo"), dateFrom);
  const format = parseFormat(formData.get("format"));
  const selectedDeckSprites = parseSpriteArray(formData.getAll("deckSprites"));

  if (!name) {
    throw new Error("Enter a tournament name before saving.");
  }

  if (format && !isKnownSiteFormat(format)) {
    throw new Error("Choose a valid tournament format.");
  }

  const tournamentId = crypto.randomUUID();

  const { error } = await supabase.from("tournaments").insert({
    id: tournamentId,
    user_id: user.id,
    name,
    date_from: dateFrom,
    date_to: dateTo,
    linked_deck_id: resolvedDeck?.linkedDeckId ?? null,
    deck_name: resolvedDeck?.deckName ?? "",
    deck_sprites: selectedDeckSprites.length > 0 ? selectedDeckSprites : (resolvedDeck?.deckSprites ?? []),
    category: parseCategory(formData.get("category")),
    placement: parsePlacement(formData.get("placement")),
    format,
    notes: String(formData.get("notes") || "").trim()
  });

  if (error) {
    throw error;
  }

  revalidateTournamentWorkspace(tournamentId);

  return {
    ok: true,
    redirectTo: `/tournaments/${tournamentId}`
  };
}

export async function updateTournamentAction(formData: FormData): Promise<SaveActionResult> {
  const user = await requireUser();
  const supabase = createClient();
  const tournamentId = String(formData.get("tournamentId") || "").trim();
  const linkedDeckId = String(formData.get("linkedDeckId") || "").trim();
  const resolvedDeck = await resolveDeckSnapshot(user.id, linkedDeckId);
  const name = String(formData.get("name") || "").trim();
  const format = parseFormat(formData.get("format"));
  const selectedDeckSprites = parseSpriteArray(formData.getAll("deckSprites"));

  if (!tournamentId) {
    throw new Error("Tournament id is required.");
  }

  if (!name) {
    throw new Error("Enter a tournament name before saving.");
  }

  if (format && !isKnownSiteFormat(format)) {
    throw new Error("Choose a valid tournament format.");
  }

  const { error } = await supabase
    .from("tournaments")
    .update({
      name,
      date_from: parseIsoDate(formData.get("dateFrom")),
      date_to: parseIsoDate(formData.get("dateTo")),
      linked_deck_id: resolvedDeck?.linkedDeckId ?? null,
      deck_name: resolvedDeck?.deckName ?? "",
      deck_sprites: selectedDeckSprites.length > 0 ? selectedDeckSprites : (resolvedDeck?.deckSprites ?? []),
      category: parseCategory(formData.get("category")),
      placement: parsePlacement(formData.get("placement")),
      format,
      notes: String(formData.get("notes") || "").trim()
    })
    .eq("id", tournamentId)
    .eq("user_id", user.id);

  if (error) {
    throw error;
  }

  revalidateTournamentWorkspace(tournamentId);

  return {
    ok: true,
    redirectTo: withRefreshToken(getRedirectTarget(formData, `/tournaments/${tournamentId}`))
  };
}

export async function deleteTournamentAction(formData: FormData): Promise<SaveActionResult> {
  const user = await requireUser();
  const supabase = createClient();
  const tournamentId = String(formData.get("tournamentId") || "").trim();

  if (!tournamentId) {
    throw new Error("Tournament id is required.");
  }

  const { error } = await supabase
    .from("tournaments")
    .delete()
    .eq("id", tournamentId)
    .eq("user_id", user.id);

  if (error) {
    throw error;
  }

  revalidateTournamentWorkspace();

  return {
    ok: true,
    redirectTo: withRefreshToken("/tournaments")
  };
}

export async function saveTournamentRoundAction(formData: FormData): Promise<SaveActionResult> {
  const user = await requireUser();
  const supabase = createClient();
  const tournamentId = String(formData.get("tournamentId") || "").trim();
  const roundId = String(formData.get("roundId") || "").trim();
  const opponentDeckSprites = parseSpriteArray(formData.getAll("opponentDeckSprites"));

  if (!tournamentId) {
    throw new Error("Tournament id is required.");
  }
  const roundNumber = await resolveTournamentRoundNumber({
    roundId,
    tournamentId,
    userId: user.id
  });

  const payload = {
    tournament_id: tournamentId,
    user_id: user.id,
    round_number: roundNumber,
    opponent_deck_name: "",
    opponent_deck_sprites: opponentDeckSprites,
    result: parseRoundResult(formData),
    notes: String(formData.get("notes") || "").trim()
  };

  if (roundId) {
    const { error } = await supabase
      .from("tournament_rounds")
      .update(payload)
      .eq("id", roundId)
      .eq("user_id", user.id);

    if (error) {
      throw toUserFacingDatabaseError(error);
    }
  } else {
    const { error } = await supabase.from("tournament_rounds").insert({
      id: crypto.randomUUID(),
      ...payload
    });

    if (error) {
      throw toUserFacingDatabaseError(error);
    }
  }

  revalidateTournamentWorkspace(tournamentId);

  return {
    ok: true,
    redirectTo: withRefreshToken(getRedirectTarget(formData, `/tournaments/${tournamentId}`))
  };
}

export async function deleteTournamentRoundAction(formData: FormData): Promise<SaveActionResult> {
  const user = await requireUser();
  const supabase = createClient();
  const tournamentId = String(formData.get("tournamentId") || "").trim();
  const roundId = String(formData.get("roundId") || "").trim();

  if (!tournamentId || !roundId) {
    throw new Error("Round id is required.");
  }

  const { error } = await supabase
    .from("tournament_rounds")
    .delete()
    .eq("id", roundId)
    .eq("user_id", user.id);

  if (error) {
    throw error;
  }

  revalidateTournamentWorkspace(tournamentId);

  return {
    ok: true,
    redirectTo: withRefreshToken(`/tournaments/${tournamentId}`)
  };
}
