import { parseLogAction } from "@/app/(app)/logs/actions";
import { privateError, privateJson, reportApiError } from "@/lib/server/api-response";

const MAX_IMPORT_BODY_CHARACTERS = 1_000_000;

function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host");
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol || new URL(request.url).protocol.replace(":", "");

  if (!origin || !host) {
    return false;
  }

  try {
    const originUrl = new URL(origin);
    return (
      originUrl.host === host &&
      originUrl.protocol === `${protocol}:` &&
      (!fetchSite || fetchSite === "same-origin")
    );
  } catch {
    return false;
  }
}

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
