import { NextRequest, NextResponse } from "next/server";
import {
  createLogShareAction,
  revokeLogShareAction
} from "@/app/(app)/logs/actions";
import { reportError } from "@/lib/server/report-error";

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json().catch(() => ({}))) as { logId?: unknown };
    const share = await createLogShareAction(String(payload.logId || ""));
    return NextResponse.json(share);
  } catch (error) {
    reportError(error, {
      action: "createLogShare",
      area: "api",
      boundary: "log-shares-route",
      route: "/api/log-shares"
    });

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "We couldn't create a share link for this battle log right now."
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const shareId = request.nextUrl.searchParams.get("shareId") ?? "";
    await revokeLogShareAction(shareId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    reportError(error, {
      action: "revokeLogShare",
      area: "api",
      boundary: "log-shares-route",
      route: "/api/log-shares"
    });

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "We couldn't revoke that share link right now."
      },
      { status: 500 }
    );
  }
}
