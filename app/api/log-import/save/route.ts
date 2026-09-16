import { importLogAction } from "@/app/(app)/logs/actions";
import { privateError, privateJson, reportApiError } from "@/lib/server/api-response";
import { reportServerPerformance } from "@/lib/server/perf";
import { isSameOriginRequest } from "@/lib/server/same-origin-request";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return privateError("The Battle Log save request was rejected.", 403);
  }

  const startedAt = performance.now();

  try {
    const result = await importLogAction(await request.formData(), "route-handler");

    reportServerPerformance("logs.import.save", {
      actionMs: performance.now() - startedAt
    });

    return privateJson(result);
  } catch (error) {
    return reportApiError(
      error,
      {
        action: "saveBattleLogImport",
        area: "api",
        boundary: "battle-log-import-save-route",
        route: "/api/log-import/save"
      },
      "Could not save this Battle Log."
    );
  }
}
