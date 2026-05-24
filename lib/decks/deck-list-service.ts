import { sortDeckListCards } from "@/lib/deck-lists/sort";
import { CANONICAL_DECK_LIST_SORT_VERSION } from "@/lib/deck-lists/version";
import { parseDeckList } from "@/lib/decks/deck-list-parse";
import { getDefaultSyncedSiteFormat } from "@/lib/formats/catalog";
import { userFacingActionError } from "@/lib/server/action-errors";
import type { requireUser } from "@/lib/auth";
import type { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/supabase";

type AuthenticatedUser = Awaited<ReturnType<typeof requireUser>>;
type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

function getCurrentDisplayName(user: AuthenticatedUser) {
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

function assertSingleMutationResult(row: { id?: unknown } | null, message: string) {
  if (!row?.id) {
    throw userFacingActionError(message);
  }
}

function getJsonDeckListCreatedAt(entry: unknown): string {
  if (!entry || typeof entry !== "object") {
    return "";
  }

  const candidate = entry as { createdAt?: unknown; created_at?: unknown };
  return String(candidate.createdAt || candidate.created_at || "").trim();
}

function asJson(value: unknown): Json {
  return value as Json;
}

async function upsertRelationalDeckLists(args: {
  deckId: string;
  deckLists: unknown[];
  supabase: SupabaseClient;
  userId: string;
}) {
  const { deckId, deckLists, supabase, userId } = args;
  const rows = deckLists
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry, position) => ({
      id: String(entry.id || ""),
      user_id: userId,
      deck_id: deckId,
      name: String(entry.name || ""),
      format: String(entry.format || ""),
      date: String(entry.date || ""),
      created_by: String(entry.createdBy || entry.created_by || ""),
      notes: String(entry.notes || ""),
      raw_list: String(entry.rawList || entry.raw_list || ""),
      parsed_cards: asJson(Array.isArray(entry.parsedCards) ? entry.parsedCards : entry.parsed_cards ?? []),
      sorted_cards: asJson(Array.isArray(entry.sortedCards) ? entry.sortedCards : entry.sorted_cards ?? []),
      sorted_cards_version:
        typeof entry.sortedCardsVersion === "number"
          ? entry.sortedCardsVersion
          : typeof entry.sorted_cards_version === "number"
            ? entry.sorted_cards_version
            : CANONICAL_DECK_LIST_SORT_VERSION,
      position,
      created_at:
        getJsonDeckListCreatedAt(entry) ||
        String(entry.updatedAt || entry.updated_at || new Date().toISOString()),
      updated_at: String(entry.updatedAt || entry.updated_at || new Date().toISOString())
    }))
    .filter((row) => row.id && row.name);

  if (rows.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("deck_lists")
    .upsert(rows, { onConflict: "user_id,deck_id,id" });

  if (error) {
    throw error;
  }
}

export async function saveDeckList(args: {
  formData: FormData;
  supabase: SupabaseClient;
  user: AuthenticatedUser;
}) {
  const { formData, supabase, user } = args;
  const deckId = String(formData.get("deckId") || "").trim();
  const deckListId = String(formData.get("deckListId") || "").trim();

  if (!deckId) {
    throw userFacingActionError("Deck id is required.");
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
    throw userFacingActionError("Deck could not be found.");
  }

  const existingDeckLists = Array.isArray(data.deck_lists) ? data.deck_lists : [];
  const existingDeckList = deckListId
    ? existingDeckLists.find(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          "id" in entry &&
          String((entry as { id?: unknown }).id || "") === deckListId
      )
    : null;
  const name = String(formData.get("name") || "").trim();
  const rawList = String(formData.get("rawList") || "").trim();

  if (deckListId && !existingDeckList) {
    throw userFacingActionError("Deck list could not be found.");
  }

  if (!name) {
    throw userFacingActionError("Enter a deck list name before saving.");
  }

  if (!rawList) {
    throw userFacingActionError("Paste the deck list before saving.");
  }

  const timestamp = new Date().toISOString();
  let parsedCards;
  let sortedCards;
  try {
    const sortedDeckListCards = await buildSortedDeckListCards(rawList);
    parsedCards = sortedDeckListCards.parsedCards;
    sortedCards = sortedDeckListCards.sortedCards;
  } catch {
    throw userFacingActionError(
      "We couldn't apply the canonical deck ordering right now. Please try saving again in a moment."
    );
  }

  const nextDeckList = {
    id: deckListId || crypto.randomUUID(),
    name,
    format:
      String(formData.get("format") || "").trim() || (await getDefaultSyncedSiteFormat()),
    date: String(formData.get("date") || "").trim() || timestamp.slice(0, 10),
    createdBy: String(formData.get("createdBy") || "").trim() || getCurrentDisplayName(user),
    notes: String(formData.get("notes") || "").trim(),
    rawList,
    parsedCards,
    sortedCards,
    sortedCardsVersion: CANONICAL_DECK_LIST_SORT_VERSION,
    createdAt:
      String(formData.get("createdAt") || "").trim() ||
      (deckListId ? String((existingDeckList as { createdAt?: unknown } | null)?.createdAt || "").trim() : "") ||
      timestamp,
    updatedAt: timestamp
  };

  const updatedDeckLists = deckListId
    ? existingDeckLists.map((entry) => {
        if (!entry || typeof entry !== "object") {
          return entry;
        }

        return String((entry as { id?: unknown }).id || "") === deckListId
          ? nextDeckList
          : entry;
      })
    : [nextDeckList, ...existingDeckLists];

  await upsertRelationalDeckLists({
    deckId,
    deckLists: updatedDeckLists,
    supabase,
    userId: user.id
  });

  const { data: updatedDeck, error: updateError } = await supabase
    .from("decks")
    .update({
      deck_lists: updatedDeckLists,
      updated_at: timestamp
    })
    .eq("id", deckId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (updateError) {
    throw updateError;
  }

  assertSingleMutationResult(updatedDeck, "Deck could not be found.");

  return {
    deckId,
    deckListId: nextDeckList.id
  };
}
