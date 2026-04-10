"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { isKnownSiteFormat } from "@/lib/formats/options";
import { createClient } from "@/lib/supabase/server";
import {
  TOURNAMENT_CATEGORY_OPTIONS,
  TOURNAMENT_PLACEMENT_OPTIONS,
  TOURNAMENT_ROUND_RESULT_OPTIONS
} from "@/lib/tournaments/options";
import type {
  TournamentCategory,
  TournamentPlacement,
  TournamentRoundResult
} from "@/types/index";

type SaveActionResult = {
  ok: true;
  redirectTo: string;
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

function parseRoundResult(value: FormDataEntryValue | null): TournamentRoundResult {
  const normalized = String(value || "").trim();
  return TOURNAMENT_ROUND_RESULT_OPTIONS.includes(normalized as TournamentRoundResult)
    ? (normalized as TournamentRoundResult)
    : "Win";
}

function parseFormat(value: FormDataEntryValue | null) {
  const normalized = String(value || "").trim();
  return normalized;
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

export async function createTournamentAction(formData: FormData): Promise<SaveActionResult> {
  const user = await requireUser();
  const supabase = createClient();
  const linkedDeckId = String(formData.get("linkedDeckId") || "").trim();
  const resolvedDeck = await resolveDeckSnapshot(user.id, linkedDeckId);
  const name = String(formData.get("name") || "").trim();
  const manualDeckName = String(formData.get("deckName") || "").trim();
  const dateFrom = parseIsoDate(formData.get("dateFrom"));
  const dateTo = parseIsoDate(formData.get("dateTo"), dateFrom);
  const format = parseFormat(formData.get("format"));

  if (!name) {
    throw new Error("Enter a tournament name before saving.");
  }

  const deckName = resolvedDeck?.deckName || manualDeckName;
  if (!deckName) {
    throw new Error("Choose a linked deck or enter a deck name.");
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
    deck_name: deckName,
    deck_sprites: resolvedDeck?.deckSprites ?? [],
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
  const manualDeckName = String(formData.get("deckName") || "").trim();
  const format = parseFormat(formData.get("format"));

  if (!tournamentId) {
    throw new Error("Tournament id is required.");
  }

  if (!name) {
    throw new Error("Enter a tournament name before saving.");
  }

  const deckName = resolvedDeck?.deckName || manualDeckName;
  if (!deckName) {
    throw new Error("Choose a linked deck or enter a deck name.");
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
      deck_name: deckName,
      deck_sprites: resolvedDeck?.deckSprites ?? [],
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
  const roundNumber = Number(formData.get("roundNumber") || "");
  const opponentDeckName = String(formData.get("opponentDeckName") || "").trim();

  if (!tournamentId) {
    throw new Error("Tournament id is required.");
  }

  if (!Number.isInteger(roundNumber) || roundNumber <= 0) {
    throw new Error("Enter a valid round number.");
  }

  if (!opponentDeckName) {
    throw new Error("Enter the opponent deck name.");
  }

  const payload = {
    tournament_id: tournamentId,
    user_id: user.id,
    round_number: roundNumber,
    opponent_deck_name: opponentDeckName,
    opponent_deck_sprites: [],
    result: parseRoundResult(formData.get("result")),
    notes: String(formData.get("notes") || "").trim()
  };

  if (roundId) {
    const { error } = await supabase
      .from("tournament_rounds")
      .update(payload)
      .eq("id", roundId)
      .eq("user_id", user.id);

    if (error) {
      throw error;
    }
  } else {
    const { error } = await supabase.from("tournament_rounds").insert({
      id: crypto.randomUUID(),
      ...payload
    });

    if (error) {
      throw error;
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
