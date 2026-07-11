import { NextRequest } from "next/server";
import { resolveBattleLogActionTagOverrides } from "@/lib/battle-log/action-tags";
import { getLogDetailBodyById } from "@/lib/db/logs";
import { requireApiUser } from "@/lib/server/api-auth";
import { privateError, privateJson, reportApiError } from "@/lib/server/api-response";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const logId = request.nextUrl.searchParams.get("id");

    if (!logId) {
      return privateError("Missing log id.", 400);
    }

    const body = await getLogDetailBodyById(user.id, logId);

    if (!body) {
      return privateError("Log not found.", 404);
    }

    return privateJson(
      {
        actionTagOverrides: await resolveBattleLogActionTagOverrides(body.sections),
        rawLog: body.rawLog,
        sections: body.sections
      }
    );
  } catch (error) {
    return reportApiError(
      error,
      {
        action: "getLogDetailBody",
        area: "api",
        boundary: "log-detail-body-route",
        route: "/api/log-detail-body"
      },
      "We couldn't load this battle log right now."
    );
  }
}
