"use server";

import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { setDeckListAssociation } from "@/lib/decks/deck-list-association-service";
import { deleteDeckList } from "@/lib/decks/deck-list-service";
import { resolveActionFailure, userFacingActionError } from "@/lib/server/action-errors";
import { revalidateDeckAndLogWorkspace } from "@/lib/server/revalidation";
import { createClient } from "@/lib/supabase/server";

async function getAffectedTournamentIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  deckListId: string
) {
  const { data, error } = await supabase
    .from("tournaments")
    .select("id")
    .eq("user_id", userId)
    .eq("linked_deck_list_id", deckListId);
  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<{ id?: unknown }>)
    .map((row) => String(row.id || "").trim())
    .filter(Boolean);
}

export async function deleteDeckListAction(
  formData: FormData
): Promise<never> {
  const deckListId = String(formData.get("deckListId") || "").trim();
  const [user, supabase] = await Promise.all([requireAuth(), createClient()]);

  try {
    if (!deckListId) {
      throw userFacingActionError("Deck List id is required.");
    }

    const tournamentIds = await getAffectedTournamentIds(supabase, user.id, deckListId);
    const expectedUpdatedAt = String(formData.get("updatedAt") || "").trim();
    await deleteDeckList({ deckListId, expectedUpdatedAt, supabase });

    revalidateDeckAndLogWorkspace({
      deckListId,
      tournamentIds
    });

  } catch (error) {
    throw resolveActionFailure(error, {
      action: "deleteDeckList",
      area: "deck-lists",
      fallbackMessage: "We couldn't delete that Deck List right now.",
      route: "/deck-lists"
    });
  }

  redirect("/deck-lists");
}

export async function setDeckListAssociationAction(
  formData: FormData
): Promise<never> {
  const deckListId = String(formData.get("deckListId") || "").trim();
  const deckId = String(formData.get("deckId") || "").trim() || null;
  const expectedUpdatedAt = String(formData.get("updatedAt") || "").trim();
  const user = await requireAuth();
  const supabase = await createClient();

  try {
    if (!deckListId) {
      throw userFacingActionError("Deck List id is required.");
    }

    const tournamentIds = await getAffectedTournamentIds(supabase, user.id, deckListId);
    await setDeckListAssociation({
      deckId,
      deckListId,
      expectedUpdatedAt,
      supabase
    });

    revalidateDeckAndLogWorkspace({
      deckId,
      deckListId,
      tournamentIds
    });

  } catch (error) {
    throw resolveActionFailure(error, {
      action: "setDeckListAssociation",
      area: "deck-lists",
      fallbackMessage: "We couldn't update that Deck List association right now.",
      route: `/deck-lists/${deckListId || ""}`
    });
  }

  redirect(`/deck-lists/${deckListId}`);
}
