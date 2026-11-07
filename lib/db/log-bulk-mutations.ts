import type { SupabaseClient } from "@supabase/supabase-js";
import { completeBulkLogMutation } from "@/lib/battle-log/bulk-mutation";
import { userFacingActionError } from "@/lib/server/action-errors";
import type { Database } from "@/types/supabase";

export async function mutateOwnedLogs(input: {
  supabase: SupabaseClient<Database>;
  userId: string;
  logIds: string[];
  mutation: { kind: "delete" } | { kind: "assign"; deckId: string | null; deckListId: string };
  invalidate: () => void;
}) {
  const logIds = Array.from(
    new Set((input.logIds ?? []).map((value) => String(value || "").trim()).filter(Boolean))
  );
  if (!logIds.length) throw userFacingActionError("Select at least one battle log.");
  // Keep one database statement: chunking would turn a later request failure
  // into a partially committed operation. Bound both work and encoded URL size.
  const filterBytes = new URLSearchParams({
    id: `in.(${logIds.map((id) => JSON.stringify(id)).join(",")})`
  }).toString().length;
  if (logIds.length > 100 || filterBytes > 6000) {
    throw userFacingActionError("Select fewer battle logs (no more than 100) and try again.");
  }
  const query = input.supabase.from("logs");
  const mutation =
    input.mutation.kind === "delete"
      ? query.delete()
      : query.update({
          linked_deck_id: input.mutation.deckId,
          linked_deck_list_id: input.mutation.deckListId
        });
  const { data, error } = await mutation.eq("user_id", input.userId).in("id", logIds).select("id");
  if (error) throw error;
  return completeBulkLogMutation(logIds, data, input.invalidate);
}
