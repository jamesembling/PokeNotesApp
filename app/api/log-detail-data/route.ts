import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDeckWithList } from "@/lib/db/decks";
import { getLogById } from "@/lib/db/logs";
import { reportError } from "@/lib/server/report-error";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  try {
    const logId = request.nextUrl.searchParams.get("id");

    if (!logId) {
      return NextResponse.json({ error: "Missing log id." }, { status: 400 });
    }

    const user = await requireUser();
    const log = await getLogById(user.id, logId);

    if (!log) {
      return NextResponse.json({ error: "Log not found." }, { status: 404 });
    }

    const linkedDeckId = log.linkedDeckId ?? undefined;
    const linkedDeckWithList =
      linkedDeckId && log.linkedDeckListId
        ? await getDeckWithList(user.id, linkedDeckId, log.linkedDeckListId)
        : null;

    return NextResponse.json(
      {
        context: {
          linkedDeckId,
          linkedDeckListFormat: linkedDeckWithList?.deckList.format,
          linkedDeckListId: linkedDeckWithList?.deckList.id,
          linkedDeckListName: linkedDeckWithList?.deckList.name,
          linkedDeckListNotes: linkedDeckWithList?.deckList.notes,
          linkedDeckListRawList: linkedDeckWithList?.deckList.rawList,
          linkedDeckListSortedCards: linkedDeckWithList?.deckList.sortedCards ?? [],
          linkedStrategyLabel:
            linkedDeckWithList?.deckList.name ??
            linkedDeckWithList?.deckName ??
            (linkedDeckId ? "Linked strategy" : "No strategy linked")
        },
        log
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0"
        }
      }
    );
  } catch (error) {
    reportError(error, {
      action: "getLogDetailData",
      area: "api",
      boundary: "log-detail-data-route",
      route: "/api/log-detail-data"
    });

    return NextResponse.json(
      {
        error: "We couldn't load this battle log right now."
      },
      { status: 500 }
    );
  }
}
