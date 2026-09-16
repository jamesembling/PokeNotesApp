import { updateLogAction } from "@/app/(app)/logs/actions";
import { privateError, privateJson, reportApiError } from "@/lib/server/api-response";
import { reportServerPerformance } from "@/lib/server/perf";
import { isSameOriginRequest } from "@/lib/server/same-origin-request";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return privateError("The Battle Log update request was rejected.", 403);
  }

  const startedAt = performance.now();

  try {
    const result = await updateLogAction(await request.formData(), "route-handler");

    reportServerPerformance("logs.update.save", {
      actionMs: performance.now() - startedAt
    });

    return privateJson(result);
  } catch (error) {
    return reportApiError(
      error,
      {
        action: "updateBattleLog",
        area: "api",
        boundary: "battle-log-update-route",
        route: "/api/logs/update"
      },
      "Could not update this Battle Log."
    );
  }
}
