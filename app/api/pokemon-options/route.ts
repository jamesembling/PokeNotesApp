import { getPokemonOptions } from "@/lib/db/pokemon";
import { requireApiUser } from "@/lib/server/api-auth";
import { privateJson, reportApiError } from "@/lib/server/api-response";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    await requireApiUser();

    const pokemonOptions = await getPokemonOptions();

    return privateJson({ pokemonOptions });
  } catch (error) {
    return reportApiError(
      error,
      {
        action: "getPokemonOptions",
        area: "api",
        boundary: "pokemon-options-route",
        route: "/api/pokemon-options"
      },
      "We couldn't load Pokemon options right now."
    );
  }
}
