import { getPokemonOptions } from "@/lib/db/pokemon";
import { getTournamentDeckChoices } from "@/lib/db/tournaments";
import { requireApiUser } from "@/lib/server/api-auth";
import { privateJson, reportApiError } from "@/lib/server/api-response";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const user = await requireApiUser();
    const [decks, pokemonOptions] = await Promise.all([
      getTournamentDeckChoices(user.id),
      getPokemonOptions()
    ]);

    return privateJson({
      decks,
      pokemonOptions
    });
  } catch (error) {
    return reportApiError(
      error,
      {
        action: "getTournamentEditorData",
        area: "api",
        boundary: "tournament-editor-data-route",
        route: "/api/tournament-editor-data"
      },
      "We couldn't load tournament editor data right now."
    );
  }
}
