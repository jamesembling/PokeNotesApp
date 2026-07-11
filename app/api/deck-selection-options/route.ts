import { getDeckSelectionOptions } from "@/lib/db/decks";
import { requireApiUser } from "@/lib/server/api-auth";
import { privateJson, reportApiError } from "@/lib/server/api-response";

export async function GET() {
  try {
    const user = await requireApiUser();
    const userDecks = await getDeckSelectionOptions(user.id);

    return privateJson({ userDecks });
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
