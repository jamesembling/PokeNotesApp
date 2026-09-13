import { requireApiUser } from "@/lib/server/api-auth";
import { privateJson, reportApiError } from "@/lib/server/api-response";
import { loadCachedBattleLogImportContext } from "@/lib/server/battle-log-import-context-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const user = await requireApiUser();
    const context = await loadCachedBattleLogImportContext(user.id);

    return privateJson(
      { ready: true },
      {
        headers: {
          "Server-Timing": `import-context;dur=${context.durationMs}`
        }
      }
    );
  } catch (error) {
    return reportApiError(
      error,
      {
        action: "warmBattleLogImportContext",
        area: "api",
        boundary: "battle-log-import-bootstrap-route",
        route: "/api/log-import/bootstrap"
      },
      "Could not prepare the Battle Log importer."
    );
  }
}
