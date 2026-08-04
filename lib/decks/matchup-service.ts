import type { requireUser } from "@/lib/auth";
import { createServerDeckAggregateWriter } from "@/lib/decks/deck-aggregate-writer";
import { parseGoPreference } from "@/lib/server/form-values";
import type { createClient } from "@/lib/supabase/server";

type AuthenticatedUser = Awaited<ReturnType<typeof requireUser>>;
type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

function createWriter(input: { supabase: SupabaseClient; user: AuthenticatedUser }) {
  return createServerDeckAggregateWriter({
    actor: {
      defaultCreatedBy: "",
      userId: input.user.id
    },
    supabase: input.supabase
  });
}

function getBaseCommand(formData: FormData) {
  return {
    deckId: String(formData.get("deckId") || ""),
    deckName: String(formData.get("deckName") || ""),
    format: String(formData.get("format") || ""),
    goPreference: parseGoPreference(formData.get("goPreference")),
    idealBench: String(formData.get("idealBench") || ""),
    matchupFavor: String(formData.get("matchupFavor") || ""),
    matchupSprites: formData
      .getAll("matchupSprites")
      .map((value) => String(value || "")),
    techsNeeded: String(formData.get("techsNeeded") || "")
  };
}

export async function createDeckMatchup(args: {
  formData: FormData;
  matchupId: string;
  supabase: SupabaseClient;
  user: AuthenticatedUser;
}) {
  const { formData, matchupId, supabase, user } = args;

  return createWriter({ supabase, user }).createMatchup({
    ...getBaseCommand(formData),
    matchupId
  });
}

export async function updateDeckMatchup(args: {
  formData: FormData;
  supabase: SupabaseClient;
  user: AuthenticatedUser;
}) {
  const { formData, supabase, user } = args;

  return createWriter({ supabase, user }).updateMatchup({
    ...getBaseCommand(formData),
    matchupId: String(formData.get("matchupId") || ""),
    matchupPlan: String(formData.get("matchupPlan") || "")
  });
}

export async function updateDeckMatchupPlan(args: {
  formData: FormData;
  supabase: SupabaseClient;
  user: AuthenticatedUser;
}) {
  const { formData, supabase, user } = args;

  return createWriter({ supabase, user }).updateMatchupFields({
    deckId: String(formData.get("deckId") || ""),
    fields: {
      idealBench: String(formData.get("idealBench") || ""),
      matchupPlan: String(formData.get("matchupPlan") || ""),
      techsNeeded: String(formData.get("techsNeeded") || "")
    },
    matchupId: String(formData.get("matchupId") || ""),
    scope: "plan"
  });
}

export async function updateDeckMatchupHeader(args: {
  formData: FormData;
  supabase: SupabaseClient;
  user: AuthenticatedUser;
}) {
  const { formData, supabase, user } = args;

  return createWriter({ supabase, user }).updateMatchupFields({
    deckId: String(formData.get("deckId") || ""),
    fields: {
      format: String(formData.get("format") || ""),
      goPreference: parseGoPreference(formData.get("goPreference")),
      matchupFavor: String(formData.get("matchupFavor") || "")
    },
    matchupId: String(formData.get("matchupId") || ""),
    scope: "header"
  });
}
