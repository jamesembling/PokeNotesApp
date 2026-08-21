import { getDeckListSelectionOptions } from "@/lib/db/deck-lists";
import { getDeckSelectionOptions } from "@/lib/db/decks";
import { requireApiUser } from "@/lib/server/api-auth";
import { privateJson, reportApiError } from "@/lib/server/api-response";

export async function GET() {
  try {
    const user = await requireApiUser();
    const [userDecks, deckLists] = await Promise.all([
      getDeckSelectionOptions(user.id),
      getDeckListSelectionOptions(user.id)
    ]);

    return privateJson({ deckLists, userDecks });
  } catch (error) {
    return reportApiError(
      error,
      {
        action: "getDeckSelectionOptions",
        area: "api",
        boundary: "deck-selection-options-route",
        route: "/api/deck-selection-options"
      },
      "We couldn't load deck selection options right now."
    );
  }
}
