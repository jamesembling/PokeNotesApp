import { NextRequest, NextResponse } from "next/server";
import {
  createLogShareAction,
  revokeLogShareAction
} from "@/app/(app)/logs/actions";
import { isUserFacingActionError } from "@/lib/server/action-errors";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/server/no-store";
import { reportError } from "@/lib/server/report-error";

function getActionErrorStatus(error: unknown) {
  if (!isUserFacingActionError(error)) {
    return 500;
  }

  const message = error.message.toLowerCase();
  return message.includes("not found") || message.includes("already revoked") ? 404 : 400;
}

function getErrorMessage(error: unknown, fallbackMessage: string) {
  return isUserFacingActionError(error) ? error.message : fallbackMessage;
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json().catch(() => ({}))) as { logId?: unknown };
    const share = await createLogShareAction(String(payload.logId || ""));
    return NextResponse.json(share, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    if (!isUserFacingActionError(error)) {
      reportError(error, {
        action: "createLogShare",
        area: "api",
        boundary: "log-shares-route",
        route: "/api/log-shares"
      });
    }

    return NextResponse.json(
      {
        error: getErrorMessage(
          error,
          "We couldn't create a share link for this battle log right now."
        )
      },
      { headers: PRIVATE_NO_STORE_HEADERS, status: getActionErrorStatus(error) }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const shareId = request.nextUrl.searchParams.get("shareId") ?? "";
    await revokeLogShareAction(shareId);
    return NextResponse.json({ ok: true }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    if (!isUserFacingActionError(error)) {
      reportError(error, {
        action: "revokeLogShare",
        area: "api",
        boundary: "log-shares-route",
        route: "/api/log-shares"
      });
    }

    return NextResponse.json(
      {
        error: getErrorMessage(error, "We couldn't revoke that share link right now.")
      },
      { headers: PRIVATE_NO_STORE_HEADERS, status: getActionErrorStatus(error) }
    );
  }
}
