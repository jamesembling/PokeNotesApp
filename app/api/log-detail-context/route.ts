import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listActiveSharesForOwnerLog } from "@/lib/db/log-shares";
import { getLogDetailSummaryById } from "@/lib/db/logs";
import { getAppOrigin } from "@/lib/server/app-url";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/server/no-store";
import { reportError } from "@/lib/server/report-error";

export async function GET(request: NextRequest) {
  try {
    const logId = request.nextUrl.searchParams.get("id");

    if (!logId) {
      return NextResponse.json(
        { error: "Missing log id." },
        { headers: PRIVATE_NO_STORE_HEADERS, status: 400 }
      );
    }

    const user = await requireUser();
    const log = await getLogDetailSummaryById(user.id, logId);

    if (!log) {
      return NextResponse.json(
        { error: "Log not found." },
        { headers: PRIVATE_NO_STORE_HEADERS, status: 404 }
      );
    }

    const [[activeShare], appOrigin] = await Promise.all([
      listActiveSharesForOwnerLog(user.id, log.id),
      getAppOrigin()
    ]);

    return NextResponse.json(
      {
        activeShare: activeShare
          ? {
              expiresAt: activeShare.expiresAt,
              shareId: activeShare.id,
              shareUrl: `${appOrigin}/shared/${activeShare.id}`
            }
          : null,
        userDecks: []
      },
      {
        headers: PRIVATE_NO_STORE_HEADERS
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
      { headers: PRIVATE_NO_STORE_HEADERS, status: 500 }
    );
  }
}
