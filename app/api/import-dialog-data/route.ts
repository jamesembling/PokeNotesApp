import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDecks } from "@/lib/db/decks";
import { getCurrentProfile } from "@/lib/db/profile";
import { getPokemonOptions } from "@/lib/db/pokemon";
import { reportError } from "@/lib/server/report-error";

export async function GET() {
  try {
    const user = await requireUser();
    const [userDecks, pokemonOptions, profile] = await Promise.all([
      getDecks(user.id),
      getPokemonOptions(),
      getCurrentProfile()
    ]);

    return NextResponse.json({
      pokemonOptions,
      userDecks,
      ptcglUsername: profile.ptcglUsername
    });
  } catch (error) {
    reportError(error, {
      action: "getImportDialogData",
      area: "api",
      boundary: "import-dialog-data-route",
      route: "/api/import-dialog-data"
    });

    return NextResponse.json(
      {
        error: "We couldn't load import data right now."
      },
      { status: 500 }
    );
  }
}
