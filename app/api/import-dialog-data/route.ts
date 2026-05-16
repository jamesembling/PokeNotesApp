import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDeckSelectionOptions } from "@/lib/db/decks";
import { getPokemonOptions } from "@/lib/db/pokemon";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/server/no-store";
import { reportError } from "@/lib/server/report-error";
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
    const user = await requireUser();
    const [userDecks, pokemonOptions, ptcglUsername] = await Promise.all([
      getDeckSelectionOptions(user.id),
      getPokemonOptions(),
      getImportProfileUsername(user.id)
    ]);

    return NextResponse.json({
      pokemonOptions,
      userDecks,
      ptcglUsername
    }, { headers: PRIVATE_NO_STORE_HEADERS });
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
      { headers: PRIVATE_NO_STORE_HEADERS, status: 500 }
    );
  }
}
