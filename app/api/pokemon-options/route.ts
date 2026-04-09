import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getPokemonOptions } from "@/lib/db/pokemon";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
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
}
