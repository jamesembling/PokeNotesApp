import { parseLogAction } from "@/app/(app)/logs/actions";
import { privateError, privateJson, reportApiError } from "@/lib/server/api-response";
import { isSameOriginRequest } from "@/lib/server/same-origin-request";

const MAX_IMPORT_BODY_CHARACTERS = 1_000_000;

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return privateError("The Battle Log review request was rejected.", 403);
  }

  try {
    const payload = (await request.json()) as { format?: unknown; rawLog?: unknown };
    const rawLog = typeof payload.rawLog === "string" ? payload.rawLog : "";
    const format = typeof payload.format === "string" ? payload.format : "";

    if (rawLog.length > MAX_IMPORT_BODY_CHARACTERS) {
      return privateError("This Battle Log is too large to review.", 413);
    }

    const formData = new FormData();
    formData.set("rawLog", rawLog);
    formData.set("format", format);
    const result = await parseLogAction(formData);

    return privateJson(result, { status: "error" in result ? 400 : 200 });
  } catch (error) {
    return reportApiError(
      error,
      {
        action: "reviewBattleLogImport",
        area: "api",
        boundary: "battle-log-import-review-route",
        route: "/api/log-import/review"
      },
      "Could not review this Battle Log."
    );
  }
}
