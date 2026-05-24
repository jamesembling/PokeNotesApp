import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDeckWithList } from "@/lib/db/decks";
import { listActiveSharesForOwnerLog } from "@/lib/db/log-shares";
import { getLogDetailSummaryById } from "@/lib/db/logs";
import { getPublicAppOrigin } from "@/lib/server/app-url";
import { privateError, privateJson, reportApiError } from "@/lib/server/api-response";

export async function GET(request: NextRequest) {
  try {
    const logId = request.nextUrl.searchParams.get("id");

    if (!logId) {
      return privateError("Missing log id.", 400);
    }

    const user = await requireUser();
    const log = await getLogDetailSummaryById(user.id, logId);

    if (!log) {
      return privateError("Log not found.", 404);
    }

    const linkedDeckWithList =
      log.linkedDeckId && log.linkedDeckListId
        ? getDeckWithList(user.id, log.linkedDeckId, log.linkedDeckListId)
        : Promise.resolve(null);
    const [[activeShare], appOrigin, linkedDeck] = await Promise.all([
      listActiveSharesForOwnerLog(user.id, log.id),
      getPublicAppOrigin(),
      linkedDeckWithList
    ]);

    return privateJson(
      {
        activeShare: activeShare
          ? {
              expiresAt: activeShare.expiresAt,
              shareId: activeShare.id,
              shareUrl: `${appOrigin}/shared/${activeShare.id}`
            }
          : null,
        linkedDeckId: log.linkedDeckId,
        linkedDeckListFormat: linkedDeck?.deckList.format,
        linkedDeckListId: linkedDeck?.deckList.id ?? log.linkedDeckListId,
        linkedDeckListName: linkedDeck?.deckList.name,
        linkedDeckListNotes: linkedDeck?.deckList.notes,
        linkedDeckListRawList: linkedDeck?.deckList.rawList,
        linkedDeckListSortedCards: linkedDeck?.deckList.sortedCards ?? [],
        linkedStrategyLabel:
          linkedDeck?.deckList.name ??
          linkedDeck?.deckName ??
          (log.linkedDeckId ? "Linked strategy" : "No strategy linked"),
        userDecks: []
      }
    );
  } catch (error) {
    return reportApiError(
      error,
      {
        action: "getLogDetailContext",
        area: "api",
        boundary: "log-detail-context-route",
        route: "/api/log-detail-context"
      },
      "We couldn't load battle log context right now."
    );
  }
}
