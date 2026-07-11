import type { requireUser } from "@/lib/auth";
import { createServerDeckAggregateWriter } from "@/lib/decks/deck-aggregate-writer";
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
    date: String(formData.get("date") || ""),
    deckId: String(formData.get("deckId") || ""),
    deckListId: String(formData.get("deckListId") || ""),
    format: String(formData.get("format") || ""),
    name: String(formData.get("name") || ""),
    notes: String(formData.get("notes") || ""),
    rawList: String(formData.get("rawList") || ""),
    submittedCreatedAt: String(formData.get("createdAt") || "")
  });
}
