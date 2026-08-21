import { NextRequest } from "next/server";
import { getDeckListById } from "@/lib/db/deck-lists";
import { getDeckWithList } from "@/lib/db/decks";
import { requireApiUser } from "@/lib/server/api-auth";
import { privateError, privateJson, reportApiError } from "@/lib/server/api-response";

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const deckId = request.nextUrl.searchParams.get("deckId") ?? "";
    const listId = request.nextUrl.searchParams.get("listId") ?? "";

    if (!listId) {
      return privateError("Missing deck list id.", 400);
    }

    const result = deckId
      ? (await getDeckWithList(user.id, deckId, listId))?.deckList ?? null
      : await getDeckListById(user.id, listId);

    if (!result) {
      return privateError("Deck list not found.", 404);
    }

    return privateJson({ deckList: result });
  } catch (error) {
    return reportApiError(
      error,
      {
        action: "getDeckList",
        area: "api",
        boundary: "deck-list-route",
        route: "/api/deck-list"
      },
      "We couldn't load this deck list right now."
    );
  }
}
