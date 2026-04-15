import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getPokemonOptions } from "@/lib/db/pokemon";
import { reportError } from "@/lib/server/report-error";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    await requireUser();

    const pokemonOptions = await getPokemonOptions();

    return NextResponse.json(
      {
        pokemonOptions
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0"
        }
      }
    );
  } catch (error) {
    reportError(error, {
      action: "getPokemonOptions",
      area: "api",
      boundary: "pokemon-options-route",
      route: "/api/pokemon-options"
    });

    return NextResponse.json(
      {
        error: "We couldn't load Pokemon options right now."
      },
      { status: 500 }
    );
  }
}
