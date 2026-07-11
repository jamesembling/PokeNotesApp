import { getDeckSelectionOptions } from "@/lib/db/decks";
import { getPokemonOptions } from "@/lib/db/pokemon";
import { requireApiUser } from "@/lib/server/api-auth";
import { privateJson, reportApiError } from "@/lib/server/api-response";
import { createClient } from "@/lib/supabase/server";

type ImportProfileRow = {
  ptcgl_username: string | null;
};

async function getImportProfileUsername(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("ptcgl_username")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return String(((data ?? null) as ImportProfileRow | null)?.ptcgl_username || "").trim();
}

export async function GET() {
  try {
    const user = await requireApiUser();
    const [userDecks, pokemonOptions, ptcglUsername] = await Promise.all([
      getDeckSelectionOptions(user.id),
      getPokemonOptions(),
      getImportProfileUsername(user.id)
    ]);

    return privateJson({
      pokemonOptions,
      userDecks,
      ptcglUsername
    });
  } catch (error) {
    return reportApiError(
      error,
      {
        action: "getImportDialogData",
        area: "api",
        boundary: "import-dialog-data-route",
        route: "/api/import-dialog-data"
      },
      "We couldn't load import data right now."
    );
  }
}
