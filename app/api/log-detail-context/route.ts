import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDeckSelectionAndLinkCandidates, getDeckWithList } from "@/lib/db/decks";
import { listActiveSharesForOwnerLog } from "@/lib/db/log-shares";
import { getLogDetailSummaryById } from "@/lib/db/logs";
import { resolveLinkedDeck } from "@/lib/log-import/deck-linking";
import { getAppOrigin } from "@/lib/server/app-url";
import { reportError } from "@/lib/server/report-error";

export async function GET(request: NextRequest) {
  try {
    const logId = request.nextUrl.searchParams.get("id");

    if (!logId) {
      return NextResponse.json({ error: "Missing log id." }, { status: 400 });
    }

    const user = await requireUser();
    const log = await getLogDetailSummaryById(user.id, logId);

    if (!log) {
      return NextResponse.json({ error: "Log not found." }, { status: 404 });
    }

    const [{ userDecks, deckLinkCandidates }, [activeShare], appOrigin] =
      await Promise.all([
        getDeckSelectionAndLinkCandidates(user.id),
        listActiveSharesForOwnerLog(user.id, log.id),
        getAppOrigin()
      ]);

    const linkedDeckId =
      resolveLinkedDeck(deckLinkCandidates, {
        linkedDeckId: log.linkedDeckId,
        selfDeckName: log.selfDeckName,
        selfDeckSprites: log.selfDeckSprites
      }) ?? undefined;
    const linkedDeck = linkedDeckId
      ? userDecks.find((deck) => deck.id === linkedDeckId) ?? null
      : null;
    const linkedDeckList = linkedDeck?.deckLists.find(
      (deckList) => deckList.id === log.linkedDeckListId
    );
    const linkedDeckWithList =
      linkedDeckId && log.linkedDeckListId
        ? await getDeckWithList(user.id, linkedDeckId, log.linkedDeckListId)
        : null;

    return NextResponse.json(
      {
        activeShare: activeShare
          ? {
              expiresAt: activeShare.expiresAt,
              shareId: activeShare.id,
              shareUrl: `${appOrigin}/shared/${activeShare.id}`
            }
          : null,
        linkedDeckId: linkedDeck?.id,
        linkedDeckListFormat: linkedDeckWithList?.deckList.format,
        linkedDeckListId: linkedDeckList?.id,
        linkedDeckListName: linkedDeckList?.name,
        linkedDeckListNotes: linkedDeckWithList?.deckList.notes,
        linkedDeckListRawList: linkedDeckWithList?.deckList.rawList,
        linkedDeckListSortedCards: linkedDeckWithList?.deckList.sortedCards ?? [],
        linkedStrategyLabel:
          linkedDeckWithList?.deckList.name ?? linkedDeck?.deckName ?? "No strategy linked",
        userDecks
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0"
        }
      }
    );
  } catch (error) {
    reportError(error, {
      action: "getLogDetailContext",
      area: "api",
      boundary: "log-detail-context-route",
      route: "/api/log-detail-context"
    });

    return NextResponse.json(
      {
        error: "We couldn't load battle log context right now."
      },
      { status: 500 }
    );
  }
}
