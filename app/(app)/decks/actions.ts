"use server";

import { requireUser } from "@/lib/auth";
import { sortDeckListCards } from "@/lib/deck-lists/sort";
import { parseDeckList, parseLines } from "@/lib/decks/deck-list-parse";
import { getDefaultDeckFormat } from "@/lib/decks/formats";
import { createClient } from "@/lib/supabase/server";

function normalizeSelectedSprites(values: FormDataEntryValue[]) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  ).slice(0, 2);
}

function parseSelectedSprites(formData: FormData) {
  const jsonValue = String(formData.get("deckPokemonJson") || "").trim();

  if (jsonValue) {
    try {
      const parsed = JSON.parse(jsonValue);
      if (Array.isArray(parsed)) {
        return normalizeSelectedSprites(parsed.map((value) => String(value ?? "")));
      }
    } catch {
      // Fall through to repeated field parsing.
    }
  }

  return normalizeSelectedSprites(formData.getAll("deckPokemon"));
}

function parseGoPreference(value: FormDataEntryValue | null) {
  return value === "First" || value === "Second" ? value : "";
}

function getRedirectTarget(formData: FormData, fallbackPath: string) {
  return String(formData.get("redirectTo") || "").trim() || fallbackPath;
}

function withRefreshToken(path: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}r=${Date.now()}`;
}

function getCurrentDisplayName(user: Awaited<ReturnType<typeof requireUser>>) {
  return (
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "Trainer"
  );
}

async function buildSortedDeckListCards(rawList: string) {
  const parsedCards = parseDeckList(rawList);

  return {
    parsedCards,
    sortedCards: await sortDeckListCards(parsedCards)
  };
}

type SaveActionResult = {
  ok: true;
  redirectTo: string;
};

export async function createDeckAction(formData: FormData): Promise<SaveActionResult> {
  const user = await requireUser();
  const supabase = createClient();
  const deckId = crypto.randomUUID();
  const deckName = String(formData.get("deckName") || "").trim();

  if (!deckName) {
    throw new Error("Enter a deck name before saving.");
  }

  const selectedSprites = parseSelectedSprites(formData);
  const payload = {
    id: deckId,
    user_id: user.id,
    deck_name: deckName,
    format: String(formData.get("format") || "").trim() || getDefaultDeckFormat(),
    go_preference: parseGoPreference(formData.get("goPreference")),
    deck_pokemon: selectedSprites,
    core_strategy: String(formData.get("coreStrategy") || "").trim(),
    general_notes: String(formData.get("generalNotes") || "").trim(),
    setup_goals: parseLines(String(formData.get("setupGoals") || "")),
    resource_plan: String(formData.get("resourcePlan") || "").trim(),
    deck_lists: []
  };

  const { error } = await supabase.from("decks").insert(payload);
  if (error) {
    throw error;
  }

  return {
    ok: true,
    redirectTo: `/decks/${deckId}`
  };
}

export async function updateDeckAction(formData: FormData): Promise<SaveActionResult> {
  const user = await requireUser();
  const supabase = createClient();
  const deckId = String(formData.get("deckId") || "").trim();

  if (!deckId) {
    throw new Error("Deck id is required.");
  }

  const deckName = String(formData.get("deckName") || "").trim();
  if (!deckName) {
    throw new Error("Enter a deck name before saving.");
  }

  const selectedSprites = parseSelectedSprites(formData);

  const { error } = await supabase
    .from("decks")
    .update({
      deck_name: deckName,
      format: String(formData.get("format") || "").trim() || getDefaultDeckFormat(),
      go_preference: parseGoPreference(formData.get("goPreference")),
      deck_pokemon: selectedSprites,
      core_strategy: String(formData.get("coreStrategy") || "").trim(),
      general_notes: String(formData.get("generalNotes") || "").trim(),
      setup_goals: parseLines(String(formData.get("setupGoals") || "")),
      resource_plan: String(formData.get("resourcePlan") || "").trim(),
      updated_at: new Date().toISOString()
    })
    .eq("id", deckId)
    .eq("user_id", user.id);

  if (error) {
    throw error;
  }

  return {
    ok: true,
    redirectTo: withRefreshToken(getRedirectTarget(formData, `/decks/${deckId}`))
  };
}

export async function deleteDeckAction(formData: FormData): Promise<SaveActionResult> {
  const user = await requireUser();
  const supabase = createClient();
  const deckId = String(formData.get("deckId") || "").trim();

  if (!deckId) {
    throw new Error("Deck id is required.");
  }

  const { error: unlinkLogsError } = await supabase
    .from("logs")
    .update({
      linked_deck_id: null,
      linked_deck_list_id: null
    })
    .eq("user_id", user.id)
    .eq("linked_deck_id", deckId);

  if (unlinkLogsError) {
    throw unlinkLogsError;
  }

  const { error: deleteError } = await supabase
    .from("decks")
    .delete()
    .eq("id", deckId)
    .eq("user_id", user.id);

  if (deleteError) {
    throw deleteError;
  }

  return {
    ok: true,
    redirectTo: withRefreshToken("/decks")
  };
}

export async function saveDeckListAction(formData: FormData): Promise<SaveActionResult> {
  const user = await requireUser();
  const supabase = createClient();
  const deckId = String(formData.get("deckId") || "").trim();
  const deckListId = String(formData.get("deckListId") || "").trim();

  if (!deckId) {
    throw new Error("Deck id is required.");
  }

  const { data, error } = await supabase
    .from("decks")
    .select("id,deck_lists")
    .eq("id", deckId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Deck could not be found.");
  }

  const existingDeckLists = Array.isArray(data.deck_lists) ? data.deck_lists : [];
  const name = String(formData.get("name") || "").trim();
  const rawList = String(formData.get("rawList") || "").trim();

  if (!name) {
    throw new Error("Enter a deck list name before saving.");
  }

  if (!rawList) {
    throw new Error("Paste the deck list before saving.");
  }

  const timestamp = new Date().toISOString();
  let parsedCards;
  let sortedCards;
  try {
    const sortedDeckListCards = await buildSortedDeckListCards(rawList);
    parsedCards = sortedDeckListCards.parsedCards;
    sortedCards = sortedDeckListCards.sortedCards;
  } catch {
    throw new Error(
      "We couldn't apply the canonical deck ordering right now. Please try saving again in a moment."
    );
  }

  const nextDeckList = {
    id: deckListId || crypto.randomUUID(),
    name,
    format: String(formData.get("format") || "").trim() || getDefaultDeckFormat(),
    date: String(formData.get("date") || "").trim() || timestamp.slice(0, 10),
    createdBy: String(formData.get("createdBy") || "").trim() || getCurrentDisplayName(user),
    notes: String(formData.get("notes") || "").trim(),
    rawList,
    parsedCards,
    sortedCards,
    createdAt:
      String(formData.get("createdAt") || "").trim() ||
      (deckListId
        ? String(
            existingDeckLists.find(
              (entry) =>
                entry &&
                typeof entry === "object" &&
                "id" in entry &&
                String((entry as { id?: unknown }).id || "") === deckListId
            )?.createdAt || ""
          ).trim()
        : "") ||
      timestamp,
    updatedAt: timestamp
  };

  const updatedDeckLists = deckListId
    ? existingDeckLists.map((entry) => {
        if (!entry || typeof entry !== "object") {
          return entry;
        }

        return String((entry as { id?: unknown }).id || "") === deckListId ? nextDeckList : entry;
      })
    : [nextDeckList, ...existingDeckLists];

  const { error: updateError } = await supabase
    .from("decks")
    .update({
      deck_lists: updatedDeckLists,
      updated_at: timestamp
    })
    .eq("id", deckId)
    .eq("user_id", user.id);

  if (updateError) {
    throw updateError;
  }

  return {
    ok: true,
    redirectTo: withRefreshToken(getRedirectTarget(formData, `/decks/${deckId}`))
  };
}
