import { parseLines } from "@/lib/decks/deck-list-parse";
import { userFacingActionError } from "@/lib/server/action-errors";
import { parseGoPreference } from "@/lib/server/form-values";
import { requireViewedVersion } from "@/lib/server/viewed-version";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type StrategyFields = {
  go_preference: string;
  core_strategy: string;
  general_notes: string;
  setup_goals: string[];
  resource_plan: string;
};

function readStrategyFields(formData: FormData, prefix: "" | "expected"): StrategyFields {
  const read = (name: string) =>
    formData.get(prefix ? `${prefix}${name[0].toUpperCase()}${name.slice(1)}` : name);
  return {
    go_preference: parseGoPreference(read("goPreference")),
    core_strategy: String(read("coreStrategy") || ""),
    general_notes: String(read("generalNotes") || ""),
    setup_goals: parseLines(String(read("setupGoals") || "")),
    resource_plan: String(read("resourcePlan") || "")
  };
}

function storedStrategyMatches(
  stored: {
    go_preference: string | null;
    core_strategy: string | null;
    general_notes: string | null;
    setup_goals: unknown;
    resource_plan: string | null;
  },
  expected: StrategyFields
) {
  return (
    (stored.go_preference ?? "") === expected.go_preference &&
    (stored.core_strategy ?? "") === expected.core_strategy &&
    (stored.general_notes ?? "") === expected.general_notes &&
    (stored.resource_plan ?? "") === expected.resource_plan &&
    JSON.stringify(stored.setup_goals ?? []) === JSON.stringify(expected.setup_goals)
  );
}

/**
 * Saves the Strategy fields guarded by the Deck version the editor last saw. A version moved
 * only by a Deck List or Matchup commit is not a Strategy conflict.
 */
export async function commitDeckStrategy(args: {
  deckId: string;
  formData: FormData;
  supabase: SupabaseClient;
  userId: string;
}): Promise<{ updatedAt: string }> {
  const { deckId, formData, supabase, userId } = args;
  const expectedUpdatedAt = requireViewedVersion(formData.get("expectedUpdatedAt"), "Strategy");
  const nextStrategy = readStrategyFields(formData, "");
  const writeStrategy = (deckVersion: string) =>
    supabase
      .from("decks")
      .update({ ...nextStrategy, updated_at: new Date().toISOString() })
      .eq("id", deckId)
      .eq("user_id", userId)
      .eq("updated_at", deckVersion)
      .select("id,updated_at")
      .maybeSingle();

  let { data: updatedDeck, error } = await writeStrategy(expectedUpdatedAt);
  if (error) {
    throw error;
  }

  // Deck List and Matchup commits also advance the Deck timestamp. Retry against the
  // current timestamp only when the Strategy this editor last saved is still stored.
  if (!updatedDeck?.id && formData.has("expectedCoreStrategy")) {
    const { data: currentDeck, error: readError } = await supabase
      .from("decks")
      .select("updated_at,go_preference,core_strategy,general_notes,setup_goals,resource_plan")
      .eq("id", deckId)
      .eq("user_id", userId)
      .maybeSingle();
    if (readError) {
      throw readError;
    }

    if (currentDeck && storedStrategyMatches(currentDeck, readStrategyFields(formData, "expected"))) {
      ({ data: updatedDeck, error } = await writeStrategy(currentDeck.updated_at));
      if (error) {
        throw error;
      }
    }
  }

  if (!updatedDeck?.id) {
    throw userFacingActionError("This Strategy changed in another tab. Copy your unsaved notes, then refresh the page and try again.");
  }
  return { updatedAt: updatedDeck.updated_at };
}
