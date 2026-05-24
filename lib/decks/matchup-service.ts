import { userFacingActionError } from "@/lib/server/action-errors";
import { normalizeSelectedSprites, parseGoPreference } from "@/lib/server/form-values";
import type { requireUser } from "@/lib/auth";
import type { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/supabase";

type AuthenticatedUser = Awaited<ReturnType<typeof requireUser>>;
type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

function assertSingleMutationResult(row: { id?: unknown } | null, message: string) {
  if (!row?.id) {
    throw userFacingActionError(message);
  }
}

function getJsonTimestamp(entry: Record<string, unknown>, camelKey: string, snakeKey: string) {
  return String(entry[camelKey] || entry[snakeKey] || "").trim();
}

function asJson(value: unknown): Json {
  return value as Json;
}

function parseStoredGoPreference(value: unknown) {
  return value === "First" || value === "Second" ? value : "";
}

async function upsertRelationalDeckMatchups(args: {
  deckId: string;
  matchups: unknown[];
  supabase: SupabaseClient;
  userId: string;
}) {
  const { deckId, matchups, supabase, userId } = args;
  const timestamp = new Date().toISOString();
  const rows = matchups
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry, position) => ({
      id: String(entry.id || ""),
      user_id: userId,
      deck_id: deckId,
      deck_name: String(entry.deckName || entry.deck_name || ""),
      deck_pokemon: asJson(Array.isArray(entry.deckPokemon) ? entry.deckPokemon : entry.deck_pokemon ?? []),
      format: String(entry.format || ""),
      go_preference: parseStoredGoPreference(entry.goPreference || entry.go_preference),
      matchup_favor: String(entry.matchupFavor || entry.matchup_favor || ""),
      ideal_bench: String(entry.idealBench || entry.ideal_bench || ""),
      techs_needed: String(entry.techsNeeded || entry.techs_needed || ""),
      matchup_plan: String(entry.matchupPlan || entry.matchup_plan || ""),
      position,
      created_at: getJsonTimestamp(entry, "createdAt", "created_at") || timestamp,
      updated_at: getJsonTimestamp(entry, "updatedAt", "updated_at") || timestamp
    }))
    .filter((row) => row.id && row.deck_name);

  if (rows.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("deck_matchups")
    .upsert(rows, { onConflict: "user_id,deck_id,id" });

  if (error) {
    throw error;
  }
}

function getRequiredMatchupFields(formData: FormData) {
  const deckName = String(formData.get("deckName") || "").trim();
  if (!deckName) {
    throw userFacingActionError("Enter a matchup deck name before saving.");
  }

  const format = String(formData.get("format") || "").trim();
  if (!format) {
    throw userFacingActionError("Choose a format before saving this matchup.");
  }

  const matchupSprites = normalizeSelectedSprites(formData.getAll("matchupSprites"));
  if (matchupSprites.length === 0) {
    throw userFacingActionError("Pick at least one Pokemon sprite for the matchup.");
  }

  return {
    deckName,
    format,
    matchupSprites
  };
}

export async function createDeckMatchup(args: {
  formData: FormData;
  matchupId: string;
  supabase: SupabaseClient;
  user: AuthenticatedUser;
}) {
  const { formData, matchupId, supabase, user } = args;
  const deckId = String(formData.get("deckId") || "").trim();

  if (!deckId) {
    throw userFacingActionError("Deck id is required.");
  }

  const { data, error } = await supabase
    .from("decks")
    .select("id,matchups")
    .eq("id", deckId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw userFacingActionError("That deck could not be found.");
  }

  const { deckName, format, matchupSprites } = getRequiredMatchupFields(formData);
  const now = new Date().toISOString();
  const existingMatchups = Array.isArray(data.matchups) ? data.matchups : [];
  const nextMatchups = [
    ...existingMatchups,
    {
      id: matchupId,
      deckName,
      deckPokemon: matchupSprites,
      format,
      goPreference: parseGoPreference(formData.get("goPreference")),
      matchupFavor: String(formData.get("matchupFavor") || "").trim(),
      idealBench: String(formData.get("idealBench") || ""),
      techsNeeded: String(formData.get("techsNeeded") || ""),
      matchupPlan: "",
      createdAt: now,
      updatedAt: now
    }
  ];

  await upsertRelationalDeckMatchups({
    deckId,
    matchups: nextMatchups,
    supabase,
    userId: user.id
  });

  const { data: updatedDeck, error: updateError } = await supabase
    .from("decks")
    .update({
      matchups: nextMatchups,
      updated_at: now
    })
    .eq("id", deckId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (updateError) {
    throw updateError;
  }

  assertSingleMutationResult(updatedDeck, "That deck could not be found.");

  return {
    deckId,
    matchupId
  };
}

export async function updateDeckMatchup(args: {
  formData: FormData;
  supabase: SupabaseClient;
  user: AuthenticatedUser;
}) {
  const { formData, supabase, user } = args;
  const deckId = String(formData.get("deckId") || "").trim();
  const matchupId = String(formData.get("matchupId") || "").trim();

  if (!deckId || !matchupId) {
    throw userFacingActionError("Deck and matchup ids are required.");
  }

  const { data, error } = await supabase
    .from("decks")
    .select("id,matchups")
    .eq("id", deckId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw userFacingActionError("That deck could not be found.");
  }

  const existingMatchups = Array.isArray(data.matchups) ? data.matchups : [];
  const currentMatchup = existingMatchups.find((entry) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }

    return String((entry as { id?: unknown }).id || "") === matchupId;
  });

  if (!currentMatchup) {
    throw userFacingActionError("That matchup could not be found.");
  }

  const { deckName, format, matchupSprites } = getRequiredMatchupFields(formData);
  const now = new Date().toISOString();
  const nextMatchups = existingMatchups.map((entry) => {
    if (!entry || typeof entry !== "object") {
      return entry;
    }

    if (String((entry as { id?: unknown }).id || "") !== matchupId) {
      return entry;
    }

    return {
      ...entry,
      deckName,
      deckPokemon: matchupSprites,
      format,
      goPreference: parseGoPreference(formData.get("goPreference")),
      matchupFavor: String(formData.get("matchupFavor") || "").trim(),
      idealBench: String(formData.get("idealBench") || ""),
      techsNeeded: String(formData.get("techsNeeded") || ""),
      matchupPlan: String(formData.get("matchupPlan") || ""),
      updatedAt: now
    };
  });

  await upsertRelationalDeckMatchups({
    deckId,
    matchups: nextMatchups,
    supabase,
    userId: user.id
  });

  const { data: updatedDeck, error: updateError } = await supabase
    .from("decks")
    .update({
      matchups: nextMatchups,
      updated_at: now
    })
    .eq("id", deckId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (updateError) {
    throw updateError;
  }

  assertSingleMutationResult(updatedDeck, "That deck could not be found.");

  return {
    deckId,
    matchupId
  };
}
