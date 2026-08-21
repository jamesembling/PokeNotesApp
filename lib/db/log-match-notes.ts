import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeMatchNotes } from "@/lib/battle-log/match-notes";
import type { Database } from "@/types/supabase";

export class MatchNotesWriteConflictError extends Error {
  constructor() {
    super("The battle log is unavailable.");
    this.name = "MatchNotesWriteConflictError";
  }
}

export async function persistOwnerMatchNotes(
  supabase: SupabaseClient<Database>,
  {
    logId,
    userId,
    value
  }: {
    logId: string;
    userId: string;
    value: unknown;
  }
) {
  const matchNotes = normalizeMatchNotes(value);
  const { data, error } = await supabase
    .from("logs")
    .update({ match_notes: matchNotes })
    .eq("user_id", userId)
    .eq("id", logId)
    .select("id,match_notes");

  if (error) {
    throw error;
  }

  if ((data ?? []).length !== 1) {
    throw new MatchNotesWriteConflictError();
  }

  return data[0].match_notes;
}
