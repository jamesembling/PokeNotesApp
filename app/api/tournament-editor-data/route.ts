import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getPokemonOptions } from "@/lib/db/pokemon";
import { getTournamentDeckChoices } from "@/lib/db/tournaments";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/server/no-store";
import { reportError } from "@/lib/server/report-error";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const user = await requireUser();
    const [decks, pokemonOptions] = await Promise.all([
      getTournamentDeckChoices(user.id),
      getPokemonOptions()
    ]);

    return NextResponse.json(
      {
        decks,
        pokemonOptions
      },
      {
        headers: PRIVATE_NO_STORE_HEADERS
      }
    );
  } catch (error) {
    reportError(error, {
      action: "getTournamentEditorData",
      area: "api",
      boundary: "tournament-editor-data-route",
      route: "/api/tournament-editor-data"
    });

    return NextResponse.json(
      {
        error: "We couldn't load tournament editor data right now."
      },
      { headers: PRIVATE_NO_STORE_HEADERS, status: 500 }
    );
  }
}
