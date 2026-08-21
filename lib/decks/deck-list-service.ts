import type { requireUser } from "@/lib/auth";
import { createServerDeckAggregateWriter } from "@/lib/decks/deck-aggregate-writer";
import {
  getDeckListStaleVersionMessage,
  isDeckListStaleVersionError
} from "@/lib/decks/deck-list-errors";
import { userFacingActionError } from "@/lib/server/action-errors";
import type { createClient } from "@/lib/supabase/server";

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

export async function saveDeckList(args: {
  formData: FormData;
  supabase: SupabaseClient;
  user: AuthenticatedUser;
}) {
  const { formData, supabase, user } = args;
  const writer = createServerDeckAggregateWriter({
    actor: {
      defaultCreatedBy: getCurrentDisplayName(user),
      userId: user.id
    },
    supabase
  });

  return writer.saveList({
    createdBy: String(formData.get("createdBy") || ""),
    creationKey: String(formData.get("creationKey") || "").trim() || undefined,
    date: String(formData.get("date") || ""),
    deckId: String(formData.get("deckId") || "").trim() || null,
    deckListId: String(formData.get("deckListId") || ""),
    format: String(formData.get("format") || ""),
    name: String(formData.get("name") || ""),
    notes: String(formData.get("notes") || ""),
    rawList: String(formData.get("rawList") || ""),
    submittedCreatedAt: String(formData.get("createdAt") || "")
  });
}

export async function deleteDeckList(args: {
  deckListId: string;
  expectedUpdatedAt: string;
  supabase: SupabaseClient;
}) {
  const deckListId = String(args.deckListId || "").trim();
  const expectedUpdatedAt = String(args.expectedUpdatedAt || "").trim();
  if (!deckListId) {
    throw userFacingActionError("Deck List id is required.");
  }
  if (!expectedUpdatedAt) {
    throw userFacingActionError("Deck List version is required; refresh before deleting.");
  }

  const { data, error } = await args.supabase.rpc("delete_first_class_deck_list", {
    p_deck_list_id: deckListId,
    p_expected_updated_at: expectedUpdatedAt
  });

  if (error) {
    if (isDeckListStaleVersionError(error)) {
      throw userFacingActionError(getDeckListStaleVersionMessage(error), {
        code: "DECK_LIST_STALE_VERSION"
      });
    }
    throw error;
  }

  const result = data as { deckListId?: string; status?: string } | null;
  if (result?.status === "not-found") {
    throw userFacingActionError("Deck List could not be found.");
  }
  if (result?.status !== "committed" || result.deckListId !== deckListId) {
    throw new Error("Deck List deletion returned an unexpected result.");
  }

  return { deckListId };
}
