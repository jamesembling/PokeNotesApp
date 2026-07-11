import { type NextRequest } from "next/server";
import {
  createLogShareAction,
  revokeLogShareAction
} from "@/app/(app)/logs/actions";
import { isUserFacingActionError } from "@/lib/server/action-errors";
import { requireApiUser } from "@/lib/server/api-auth";
import { apiAuthenticationErrorResponse, privateJson } from "@/lib/server/api-response";
import { reportError } from "@/lib/server/report-error";

function getActionErrorStatus(error: unknown) {
  return isUserFacingActionError(error) ? (error.httpStatus ?? 400) : 500;
}

function getErrorMessage(error: unknown, fallbackMessage: string) {
  return isUserFacingActionError(error) ? error.message : fallbackMessage;
}

export async function POST(request: NextRequest) {
  try {
    await requireApiUser();
    const payload = (await request.json().catch(() => ({}))) as { logId?: unknown };
    const share = await createLogShareAction(String(payload.logId || ""));
    return privateJson(share);
  } catch (error) {
    const authenticationResponse = apiAuthenticationErrorResponse(error);
    if (authenticationResponse) {
      return authenticationResponse;
    }

    if (!isUserFacingActionError(error)) {
      reportError(error, {
        action: "createLogShare",
        area: "api",
        boundary: "log-shares-route",
        route: "/api/log-shares"
      });
    }

    return privateJson(
      {
        error: getErrorMessage(
          error,
          "We couldn't create a share link for this battle log right now."
        )
      },
      { status: getActionErrorStatus(error) }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireApiUser();
    const shareId = request.nextUrl.searchParams.get("shareId") ?? "";
    await revokeLogShareAction(shareId);
    return privateJson({ ok: true });
  } catch (error) {
    const authenticationResponse = apiAuthenticationErrorResponse(error);
    if (authenticationResponse) {
      return authenticationResponse;
    }

    if (!isUserFacingActionError(error)) {
      reportError(error, {
        action: "revokeLogShare",
        area: "api",
        boundary: "log-shares-route",
        route: "/api/log-shares"
      });
    }

    return privateJson(
      {
        error: getErrorMessage(error, "We couldn't revoke that share link right now.")
      },
      { status: getActionErrorStatus(error) }
    );
  }
}
