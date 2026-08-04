import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function deleteOwnedDeck(input: {
  deckId: string;
  supabase: SupabaseClient;
  userId: string;
}) {
  const { data, error } = await input.supabase
    .from("decks")
    .delete()
    .eq("id", input.deckId)
    .eq("user_id", input.userId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}
