import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { resolveBattleLogActionTagOverrides } from "@/lib/battle-log/action-tags";
import { getLogDetailBodyById } from "@/lib/db/logs";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/server/no-store";
import { reportError } from "@/lib/server/report-error";

export const runtime = "nodejs";

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
    const body = await getLogDetailBodyById(user.id, logId);

    if (!body) {
      return NextResponse.json(
        { error: "Log not found." },
        { headers: PRIVATE_NO_STORE_HEADERS, status: 404 }
      );
    }

    return NextResponse.json(
      {
        actionTagOverrides: await resolveBattleLogActionTagOverrides(body.sections),
        rawLog: body.rawLog,
        sections: body.sections
      },
      {
        headers: PRIVATE_NO_STORE_HEADERS
      }
    );
  } catch (error) {
    reportError(error, {
      action: "getLogDetailBody",
      area: "api",
      boundary: "log-detail-body-route",
      route: "/api/log-detail-body"
    });

    return NextResponse.json(
      {
        error: "We couldn't load this battle log right now."
      },
      { headers: PRIVATE_NO_STORE_HEADERS, status: 500 }
    );
  }
}
