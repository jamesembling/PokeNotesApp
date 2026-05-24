"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { buildDeckArchetypeId } from "@/lib/decks/archetype";
import { parseLines } from "@/lib/decks/deck-list-parse";
import { saveDeckList } from "@/lib/decks/deck-list-service";
import {
  createDeckMatchup,
  updateDeckMatchup
} from "@/lib/decks/matchup-service";
import { getDefaultSyncedSiteFormat } from "@/lib/formats/catalog";
import { getAllLogsForDeck } from "@/lib/db/logs";
import { getDeckLinkCandidates } from "@/lib/log-import/deck-linking";
import {
  resolveActionFailure,
  userFacingActionError
} from "@/lib/server/action-errors";
import { getFormRedirectPath, withRefreshToken } from "@/lib/server/action-redirect";
import {
  parseGoPreference,
  parseJsonOrRepeatedSprites
} from "@/lib/server/form-values";
import { revalidateDeckAndLogWorkspace } from "@/lib/server/revalidation";
import { createClient } from "@/lib/supabase/server";

function parseSelectedSprites(formData: FormData) {
  return parseJsonOrRepeatedSprites({
    formData,
    jsonFieldName: "deckPokemonJson",
    repeatedFieldName: "deckPokemon"
  });
}

type SaveActionResult = {
  ok: true;
  redirectTo: string;
};

export async function loadDeckLinkedLogsAction(deckId: string) {
  const user = await requireUser();
  const deckLinkCandidates = await getDeckLinkCandidates(user.id);
  return getAllLogsForDeck(user.id, deckId, deckLinkCandidates);
}

function assertSingleMutationResult(row: { id?: unknown } | null, message: string) {
  if (!row?.id) {
    throw userFacingActionError(message);
  }
}

export async function createDeckAction(formData: FormData): Promise<SaveActionResult> {
  const deckId = crypto.randomUUID();

  try {
    const user = await requireUser();
    const supabase = await createClient();
    const deckName = String(formData.get("deckName") || "").trim();

    if (!deckName) {
      throw userFacingActionError("Enter a deck name before saving.");
    }

    const selectedSprites = parseSelectedSprites(formData);
    const archetypeId = buildDeckArchetypeId(selectedSprites);
    const payload = {
      id: deckId,
      user_id: user.id,
      deck_name: deckName,
      archetype_id: archetypeId,
      format:
        String(formData.get("format") || "").trim() || (await getDefaultSyncedSiteFormat()),
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

    revalidateDeckAndLogWorkspace();

    return {
      ok: true,
      redirectTo: `/decks/${deckId}`
    };
  } catch (error) {
    throw resolveActionFailure(error, {
      action: "createDeck",
      area: "decks",
      deckId,
      fallbackMessage: "We couldn't save that deck right now.",
      route: "/decks"
    });
  }
}

export async function updateDeckAction(formData: FormData): Promise<SaveActionResult> {
  const deckId = String(formData.get("deckId") || "").trim();

  try {
    const user = await requireUser();
    const supabase = await createClient();

    if (!deckId) {
      throw userFacingActionError("Deck id is required.");
    }

    const deckName = String(formData.get("deckName") || "").trim();
    if (!deckName) {
      throw userFacingActionError("Enter a deck name before saving.");
    }

    const selectedSprites = parseSelectedSprites(formData);
    const archetypeId = buildDeckArchetypeId(selectedSprites);

    const { data: updatedDeck, error } = await supabase
      .from("decks")
      .update({
        deck_name: deckName,
        archetype_id: archetypeId,
        format:
          String(formData.get("format") || "").trim() || (await getDefaultSyncedSiteFormat()),
        go_preference: parseGoPreference(formData.get("goPreference")),
        deck_pokemon: selectedSprites,
        core_strategy: String(formData.get("coreStrategy") || "").trim(),
        general_notes: String(formData.get("generalNotes") || "").trim(),
        setup_goals: parseLines(String(formData.get("setupGoals") || "")),
        resource_plan: String(formData.get("resourcePlan") || "").trim(),
        updated_at: new Date().toISOString()
      })
      .eq("id", deckId)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (error) {
      throw error;
    }

    assertSingleMutationResult(updatedDeck, "Deck could not be found.");

    revalidateDeckAndLogWorkspace();

    return {
      ok: true,
      redirectTo: withRefreshToken(getFormRedirectPath(formData, `/decks/${deckId}`))
    };
  } catch (error) {
    throw resolveActionFailure(error, {
      action: "updateDeck",
      area: "decks",
      deckId,
      fallbackMessage: "We couldn't update that deck right now.",
      route: "/decks"
    });
  }
}

export async function updateDeckStrategyAction(formData: FormData): Promise<SaveActionResult> {
  const deckId = String(formData.get("deckId") || "").trim();

  try {
    const user = await requireUser();
    const supabase = await createClient();

    if (!deckId) {
      throw userFacingActionError("Deck id is required.");
    }

    const { data: updatedDeck, error } = await supabase
      .from("decks")
      .update({
        go_preference: parseGoPreference(formData.get("goPreference")),
        core_strategy: String(formData.get("coreStrategy") || ""),
        general_notes: String(formData.get("generalNotes") || ""),
        setup_goals: parseLines(String(formData.get("setupGoals") || "")),
        resource_plan: String(formData.get("resourcePlan") || ""),
        updated_at: new Date().toISOString()
      })
      .eq("id", deckId)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (error) {
      throw error;
    }

    assertSingleMutationResult(updatedDeck, "Deck could not be found.");

    revalidateDeckAndLogWorkspace();
    revalidatePath(`/decks/${deckId}`, "page");

    return {
      ok: true,
      redirectTo: withRefreshToken(`/decks/${deckId}`)
    };
  } catch (error) {
    throw resolveActionFailure(error, {
      action: "updateDeckStrategy",
      area: "decks",
      deckId,
      fallbackMessage: "We couldn't save that strategy right now.",
      route: deckId ? `/decks/${deckId}` : "/decks"
    });
  }
}

export async function deleteDeckAction(formData: FormData): Promise<SaveActionResult> {
  const deckId = String(formData.get("deckId") || "").trim();

  try {
    const user = await requireUser();
    const supabase = await createClient();

    if (!deckId) {
      throw userFacingActionError("Deck id is required.");
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

    const { data: deletedDeck, error: deleteError } = await supabase
      .from("decks")
      .delete()
      .eq("id", deckId)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (deleteError) {
      throw deleteError;
    }

    assertSingleMutationResult(deletedDeck, "Deck could not be found.");

    revalidateDeckAndLogWorkspace();

    return {
      ok: true,
      redirectTo: withRefreshToken("/decks")
    };
  } catch (error) {
    throw resolveActionFailure(error, {
      action: "deleteDeck",
      area: "decks",
      deckId,
      fallbackMessage: "We couldn't delete that deck right now.",
      route: "/decks"
    });
  }
}

export async function createDeckMatchupAction(formData: FormData): Promise<SaveActionResult> {
  const deckId = String(formData.get("deckId") || "").trim();
  const matchupId = crypto.randomUUID();

  try {
    const user = await requireUser();
    const supabase = await createClient();
    const result = await createDeckMatchup({
      formData,
      matchupId,
      supabase,
      user
    });

    revalidateDeckAndLogWorkspace();
    revalidatePath(`/decks/${result.deckId}`, "page");
    revalidatePath(`/decks/${result.deckId}/matchups/${result.matchupId}`, "page");

    return {
      ok: true,
      redirectTo: withRefreshToken(`/decks/${result.deckId}/matchups/${result.matchupId}`)
    };
  } catch (error) {
    throw resolveActionFailure(error, {
      action: "createDeckMatchup",
      area: "decks",
      deckId,
      fallbackMessage: "We couldn't create that matchup right now.",
      route: deckId ? `/decks/${deckId}` : "/decks"
    });
  }
}

export async function updateDeckMatchupAction(formData: FormData): Promise<SaveActionResult> {
  const deckId = String(formData.get("deckId") || "").trim();
  const matchupId = String(formData.get("matchupId") || "").trim();

  try {
    const user = await requireUser();
    const supabase = await createClient();
    const result = await updateDeckMatchup({
      formData,
      supabase,
      user
    });

    revalidateDeckAndLogWorkspace();
    revalidatePath(`/decks/${result.deckId}`, "page");
    revalidatePath(`/decks/${result.deckId}/matchups/${result.matchupId}`, "page");

    return {
      ok: true,
      redirectTo: withRefreshToken(`/decks/${result.deckId}/matchups/${result.matchupId}`)
    };
  } catch (error) {
    throw resolveActionFailure(error, {
      action: "updateDeckMatchup",
      area: "decks",
      deckId,
      fallbackMessage: "We couldn't save that matchup right now.",
      route: deckId ? `/decks/${deckId}/matchups/${matchupId}` : "/decks"
    });
  }
}

export async function saveDeckListAction(formData: FormData): Promise<SaveActionResult> {
  const deckId = String(formData.get("deckId") || "").trim();
  const deckListId = String(formData.get("deckListId") || "").trim();

  try {
    const user = await requireUser();
    const supabase = await createClient();
    const result = await saveDeckList({
      formData,
      supabase,
      user
    });

    revalidateDeckAndLogWorkspace();

    return {
      ok: true,
      redirectTo: withRefreshToken(getFormRedirectPath(formData, `/decks/${result.deckId}`))
    };
  } catch (error) {
    throw resolveActionFailure(error, {
      action: deckListId ? "updateDeckList" : "createDeckList",
      area: "decks",
      deckId,
      fallbackMessage: "We couldn't save that deck list right now.",
      route: "/decks"
    });
  }
}
