import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDeckSelectionOptions } from "@/lib/db/decks";

export async function GET() {
  const user = await requireUser();
  const userDecks = await getDeckSelectionOptions(user.id);

  return NextResponse.json(
    { userDecks },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0"
      }
    }
  );
}
