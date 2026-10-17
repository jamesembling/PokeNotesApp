"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { buildDeckArchetypeId } from "@/lib/decks/archetype";
import { deleteOwnedDeck } from "@/lib/decks/delete-service";
import { parseLines } from "@/lib/decks/deck-list-parse";
import { saveDeckList } from "@/lib/decks/deck-list-service";
import {
  createDeckMatchup,
  updateDeckMatchupHeader,
  updateDeckMatchupPlan,
  updateDeckMatchup
} from "@/lib/decks/matchup-service";
import { getDefaultSyncedSiteFormat } from "@/lib/formats/catalog";
import { getAllLogsForDeck } from "@/lib/db/logs";
import { getDeckLinkCandidates } from "@/lib/log-import/deck-linking";
import {
  resolveActionFailure,
  toActionFailureResult,
  userFacingActionError
} from "@/lib/server/action-errors";
import type { FailedActionResult } from "@/lib/server/action-errors";
import { getFormRedirectPath, withRefreshToken } from "@/lib/server/action-redirect";
import {
  parseGoPreference,
  parseJsonOrRepeatedSprites
} from "@/lib/server/form-values";
import { revalidateDeckAndLogWorkspace } from "@/lib/server/revalidation";
import { invalidateBattleLogImportContext } from "@/lib/server/battle-log-import-context-cache";
import { requireViewedVersion } from "@/lib/server/viewed-version";
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

type VersionedSaveActionResult = SaveActionResult & { updatedAt: string };

type MatchupSaveActionResult = SaveActionResult | FailedActionResult;

export async function loadDeckLinkedLogsAction(deckId: string) {
  const user = await requireAuth();
  const deckLinkCandidates = await getDeckLinkCandidates(user.id);
  return getAllLogsForDeck(user.id, deckId, deckLinkCandidates);
}

function assertSingleMutationResult(row: { id?: unknown } | null, message: string) {
  if (!row?.id) {
    throw userFacingActionError(message);
  }
}

async function getAffectedTournamentIdsForDeckList(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  deckListId: string
) {
  if (!deckListId) {
    return [];
  }

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

export async function createDeckAction(formData: FormData): Promise<SaveActionResult> {
  const deckId = crypto.randomUUID();
  const [user, supabase] = await Promise.all([requireAuth(), createClient()]);

  try {
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

    invalidateBattleLogImportContext(user.id);
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
  const [user, supabase] = await Promise.all([requireAuth(), createClient()]);

  try {
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

    invalidateBattleLogImportContext(user.id);
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

export async function updateDeckStrategyAction(formData: FormData): Promise<VersionedSaveActionResult> {
  const deckId = String(formData.get("deckId") || "").trim();
  const [user, supabase] = await Promise.all([requireAuth(), createClient()]);

  try {
    if (!deckId) {
      throw userFacingActionError("Deck id is required.");
    }

    const expectedUpdatedAt = requireViewedVersion(formData.get("expectedUpdatedAt"), "Strategy");
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
      .eq("updated_at", expectedUpdatedAt)
      .select("id,updated_at")
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!updatedDeck?.id) {
      throw userFacingActionError("This Strategy changed in another tab. Copy your unsaved notes, then refresh the page and try again.");
    }

    revalidateDeckAndLogWorkspace();
    revalidatePath(`/decks/${deckId}`, "page");

    return {
      ok: true,
      updatedAt: updatedDeck.updated_at,
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
  const [user, supabase] = await Promise.all([requireAuth(), createClient()]);

  try {
    if (!deckId) {
      throw userFacingActionError("Deck id is required.");
    }

    const [deckListResult, tournamentResult] = await Promise.all([
      supabase
        .from("deck_lists")
        .select("id")
        .eq("user_id", user.id)
        .eq("deck_id", deckId),
      supabase
        .from("tournaments")
        .select("id")
        .eq("user_id", user.id)
        .eq("linked_deck_id", deckId)
    ]);
    if (deckListResult.error) {
      throw deckListResult.error;
    }
    if (tournamentResult.error) {
      throw tournamentResult.error;
    }

    const deckListIds = (deckListResult.data ?? []).map((row) => row.id);
    let listTournamentIds: string[] = [];
    if (deckListIds.length > 0) {
      const { data, error } = await supabase
        .from("tournaments")
        .select("id")
        .eq("user_id", user.id)
        .in("linked_deck_list_id", deckListIds);
      if (error) {
        throw error;
      }
      listTournamentIds = (data ?? []).map((row) => row.id);
    }

    // The tenant-scoped foreign keys and orphan-link trigger clear linked log
    // and tournament references inside the same database delete transaction.
    const deletedDeck = await deleteOwnedDeck({ deckId, supabase, userId: user.id });

    assertSingleMutationResult(deletedDeck, "Deck could not be found.");

    invalidateBattleLogImportContext(user.id);
    revalidateDeckAndLogWorkspace({
      deckId,
      deckListIds,
      tournamentIds: Array.from(
        new Set([
          ...(tournamentResult.data ?? []).map((row) => row.id),
          ...listTournamentIds
        ])
      )
    });

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

export async function createDeckMatchupAction(
  formData: FormData
): Promise<MatchupSaveActionResult> {
  const deckId = String(formData.get("deckId") || "").trim();
  const matchupId = crypto.randomUUID();
  const [user, supabase] = await Promise.all([requireAuth(), createClient()]);

  try {
    const result = await createDeckMatchup({
      formData,
      matchupId,
      supabase,
      user
    });

    revalidateDeckAndLogWorkspace({
      deckId: result.deckId
    });
    revalidatePath(`/decks/${result.deckId}`, "page");
    revalidatePath(`/decks/${result.deckId}/matchups/${result.matchupId}`, "page");

    return {
      ok: true,
      redirectTo: withRefreshToken(`/decks/${result.deckId}/matchups/${result.matchupId}`)
    };
  } catch (error) {
    return toActionFailureResult(error, {
      action: "createDeckMatchup",
      area: "decks",
      deckId,
      fallbackMessage: "We couldn't create that matchup right now.",
      route: deckId ? `/decks/${deckId}` : "/decks"
    });
  }
}

export async function updateDeckMatchupAction(
  formData: FormData
): Promise<MatchupSaveActionResult> {
  const deckId = String(formData.get("deckId") || "").trim();
  const matchupId = String(formData.get("matchupId") || "").trim();
  const [user, supabase] = await Promise.all([requireAuth(), createClient()]);

  try {
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
    return toActionFailureResult(error, {
      action: "updateDeckMatchup",
      area: "decks",
      deckId,
      fallbackMessage: "We couldn't save that matchup right now.",
      route: deckId ? `/decks/${deckId}/matchups/${matchupId}` : "/decks"
    });
  }
}

export async function updateDeckMatchupPlanAction(
  formData: FormData
): Promise<VersionedSaveActionResult> {
  const deckId = String(formData.get("deckId") || "").trim();
  const matchupId = String(formData.get("matchupId") || "").trim();
  const [user, supabase] = await Promise.all([requireAuth(), createClient()]);

  try {
    const result = await updateDeckMatchupPlan({ formData, supabase, user });

    revalidateDeckAndLogWorkspace();
    revalidatePath(`/decks/${result.deckId}`, "page");
    revalidatePath(`/decks/${result.deckId}/matchups/${result.matchupId}`, "page");

    return {
      ok: true,
      updatedAt: result.updatedAt,
      redirectTo: withRefreshToken(`/decks/${result.deckId}/matchups/${result.matchupId}`)
    };
  } catch (error) {
    throw resolveActionFailure(error, {
      action: "updateDeckMatchupPlan",
      area: "decks",
      deckId,
      fallbackMessage: "We couldn't save that matchup plan right now.",
      route: deckId ? `/decks/${deckId}/matchups/${matchupId}` : "/decks"
    });
  }
}

export async function updateDeckMatchupHeaderAction(
  formData: FormData
): Promise<VersionedSaveActionResult> {
  const deckId = String(formData.get("deckId") || "").trim();
  const matchupId = String(formData.get("matchupId") || "").trim();
  const [user, supabase] = await Promise.all([requireAuth(), createClient()]);

  try {
    const result = await updateDeckMatchupHeader({ formData, supabase, user });

    revalidateDeckAndLogWorkspace();
    revalidatePath(`/decks/${result.deckId}`, "page");
    revalidatePath(`/decks/${result.deckId}/matchups/${result.matchupId}`, "page");

    return {
      ok: true,
      updatedAt: result.updatedAt,
      redirectTo: withRefreshToken(`/decks/${result.deckId}/matchups/${result.matchupId}`)
    };
  } catch (error) {
    throw resolveActionFailure(error, {
      action: "updateDeckMatchupHeader",
      area: "decks",
      deckId,
      fallbackMessage: "We couldn't save that matchup preference right now.",
      route: deckId ? `/decks/${deckId}/matchups/${matchupId}` : "/decks"
    });
  }
}

export async function saveDeckListAction(formData: FormData): Promise<SaveActionResult> {
  const deckId = String(formData.get("deckId") || "").trim();
  const deckListId = String(formData.get("deckListId") || "").trim();
  const [user, supabase] = await Promise.all([requireAuth(), createClient()]);

  try {
    const tournamentIds = await getAffectedTournamentIdsForDeckList(
      supabase,
      user.id,
      deckListId
    );
    const result = await saveDeckList({
      formData,
      supabase,
      user
    });

    revalidateDeckAndLogWorkspace({
      deckId: result.deckId,
      deckListId: result.deckListId,
      tournamentIds
    });

    const redirectPath =
      deckListId && result.deckListId !== deckListId && result.deckId
        ? `/deck-lists/${encodeURIComponent(result.deckListId)}?deckId=${encodeURIComponent(result.deckId)}`
        : getFormRedirectPath(formData, result.deckId ? `/decks/${result.deckId}` : "/deck-lists");

    return {
      ok: true,
      redirectTo: withRefreshToken(redirectPath)
    };
  } catch (error) {
    throw resolveActionFailure(error, {
      action: deckListId ? "updateDeckList" : "createDeckList",
      area: "decks",
      deckId,
      fallbackMessage: "We couldn't save that deck list right now.",
      route: deckId ? "/decks" : "/deck-lists"
    });
  }
}
