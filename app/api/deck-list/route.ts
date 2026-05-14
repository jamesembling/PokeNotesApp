import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDeckWithList } from "@/lib/db/decks";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/server/no-store";
import { reportError } from "@/lib/server/report-error";

export async function GET(request: NextRequest) {
  try {
    const deckId = request.nextUrl.searchParams.get("deckId") ?? "";
    const listId = request.nextUrl.searchParams.get("listId") ?? "";

    if (!deckId || !listId) {
      return NextResponse.json(
        { error: "Missing deck list id." },
        { headers: PRIVATE_NO_STORE_HEADERS, status: 400 }
      );
    }

    const user = await requireUser();
    const result = await getDeckWithList(user.id, deckId, listId);

    if (!result) {
      return NextResponse.json(
        { error: "Deck list not found." },
        { headers: PRIVATE_NO_STORE_HEADERS, status: 404 }
      );
    }

    return NextResponse.json(
      { deckList: result.deckList },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    reportError(error, {
      action: "getDeckList",
      area: "api",
      boundary: "deck-list-route",
      route: "/api/deck-list"
    });

    return NextResponse.json(
      { error: "We couldn't load this deck list right now." },
      { headers: PRIVATE_NO_STORE_HEADERS, status: 500 }
    );
  }
}
