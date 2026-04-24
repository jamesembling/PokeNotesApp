import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getLogDetailBodyById } from "@/lib/db/logs";
import { reportError } from "@/lib/server/report-error";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  try {
    const logId = request.nextUrl.searchParams.get("id");

    if (!logId) {
      return NextResponse.json({ error: "Missing log id." }, { status: 400 });
    }

    const user = await requireUser();
    const body = await getLogDetailBodyById(user.id, logId);

    if (!body) {
      return NextResponse.json({ error: "Log not found." }, { status: 404 });
    }

    return NextResponse.json(
      {
        rawLog: body.rawLog,
        sections: body.sections
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0"
        }
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
      { status: 500 }
    );
  }
}
