import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDecks } from "@/lib/db/decks";
import { getPokemonOptions } from "@/lib/db/pokemon";

export async function GET() {
  const user = await requireUser();
  const [userDecks, pokemonOptions] = await Promise.all([
    getDecks(user.id),
    getPokemonOptions()
  ]);

  return NextResponse.json({
    pokemonOptions,
    userDecks
  });
}
