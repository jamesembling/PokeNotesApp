import { NextRequest } from "next/server";
import { getDeckListById } from "@/lib/db/deck-lists";
import { getDeckWithList } from "@/lib/db/decks";
import { listActiveSharesForOwnerLog } from "@/lib/db/log-shares";
import { getLogDetailSummaryById } from "@/lib/db/logs";
import { getPublicAppOrigin } from "@/lib/server/app-url";
import { requireApiUser } from "@/lib/server/api-auth";
import { privateError, privateJson, reportApiError } from "@/lib/server/api-response";
import { buildSharedLogUrl } from "@/lib/server/share-url";
import { projectOwnerBattleLogDetail } from "@/lib/battle-log/detail-projection";

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const logId = request.nextUrl.searchParams.get("id");

    if (!logId) {
      return privateError("Missing log id.", 400);
    }

    const log = await getLogDetailSummaryById(user.id, logId);

    if (!log) {
      return privateError("Log not found.", 404);
    }

    const linkedDeckWithList =
      log.linkedDeckId && log.linkedDeckListId
        ? getDeckWithList(user.id, log.linkedDeckId, log.linkedDeckListId)
        : Promise.resolve(null);
    const standaloneDeckList =
      !log.linkedDeckId && log.linkedDeckListId
        ? getDeckListById(user.id, log.linkedDeckListId)
        : Promise.resolve(null);
    const [[activeShare], appOrigin, linkedDeck, standaloneList] = await Promise.all([
      listActiveSharesForOwnerLog(user.id, log.id),
      getPublicAppOrigin(),
      linkedDeckWithList,
      standaloneDeckList
    ]);
    const linkedList = linkedDeck?.deckList ?? standaloneList;
    const projection = projectOwnerBattleLogDetail({
      linkedDeckList: {
        format: linkedList?.format,
        name: linkedList?.name,
        notes: linkedList?.notes,
        rawList: linkedList?.rawList,
        sortedCards: linkedList?.sortedCards ?? []
      },
      linkedStrategyLabel:
        linkedList?.name ??
        linkedDeck?.deckName ??
        (log.linkedDeckId ? "Linked strategy" : "No strategy linked"),
      log
    });

    return privateJson(
      {
        activeShare: activeShare
          ? {
              expiresAt: activeShare.expiresAt,
              shareId: activeShare.id,
              shareUrl: buildSharedLogUrl(appOrigin, activeShare.id)
            }
          : null,
        linkedDeckId: projection.log.linkedDeckId,
        linkedDeckListFormat: projection.linkedDeckList.format,
        linkedDeckListId: linkedList?.id ?? log.linkedDeckListId,
        linkedDeckListName: projection.linkedDeckList.name,
        linkedDeckListNotes: projection.linkedDeckList.notes,
        linkedDeckListRawList: projection.linkedDeckList.rawList,
        linkedDeckListSortedCards: projection.linkedDeckList.sortedCards,
        linkedStrategyLabel: projection.linkedStrategyLabel,
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
