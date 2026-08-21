import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function deleteOwnedDeck(input: {
  deckId: string;
  supabase: SupabaseClient;
  userId: string;
}) {
  const { data, error } = await input.supabase.rpc("delete_owned_deck", {
    p_deck_id: input.deckId
  });

  if (error) {
    throw error;
  }

  return data as { id: string } | null;
}
