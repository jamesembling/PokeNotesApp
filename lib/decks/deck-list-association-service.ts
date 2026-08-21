import { createClient } from "@/lib/supabase/server";
import {
  getDeckListStaleVersionMessage,
  isDeckListStaleVersionError
} from "@/lib/decks/deck-list-errors";
import { userFacingActionError } from "@/lib/server/action-errors";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type DeckListAssociationResult = {
  deckId: string | null;
  deckListId: string;
  status: "committed";
};

/**
 * Attach or detach a first-class Deck List from the caller's Deck Strategy.
 *
 * The database RPC owns the account/strategy checks, compatibility JSON sync,
 * and optimistic-concurrency check. Keeping this boundary explicit prevents a
 * caller from treating a supplied strategy id as proof of list ownership.
 */
export async function setDeckListAssociation(input: {
  deckId?: string | null;
  deckListId: string;
  expectedUpdatedAt: string;
  supabase: SupabaseClient;
  updatedAt?: string;
}): Promise<DeckListAssociationResult> {
  const deckListId = String(input.deckListId || "").trim();
  const expectedUpdatedAt = String(input.expectedUpdatedAt || "").trim();
  if (!deckListId) {
    throw new Error("Deck List id is required.");
  }
  if (!expectedUpdatedAt) {
    throw new Error("Deck List version is required; refresh before changing its association.");
  }

  const updatedAt = input.updatedAt ?? new Date().toISOString();
  const deckId = String(input.deckId || "").trim() || null;
  const { data, error } = await input.supabase.rpc("set_deck_list_association", {
    p_deck_id: deckId,
    p_deck_list_id: deckListId,
    p_expected_updated_at: expectedUpdatedAt,
    p_updated_at: updatedAt
  });

  if (error) {
    if (isDeckListStaleVersionError(error)) {
      throw userFacingActionError(getDeckListStaleVersionMessage(error), {
        code: "DECK_LIST_STALE_VERSION"
      });
    }

    throw error;
  }

  const result = data as {
    deckList?: { deck_id?: string | null; id?: string };
    status?: string;
  } | null;
  const resultDeckListId = String(result?.deckList?.id || "").trim();
  if (result?.status !== "committed" || resultDeckListId !== deckListId) {
    throw new Error("Deck List association returned an unexpected result.");
  }

  return {
    deckId: result.deckList?.deck_id ?? deckId,
    deckListId: resultDeckListId,
    status: "committed"
  };
}
