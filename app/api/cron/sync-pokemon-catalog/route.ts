import { invalidateReferenceDataCaches } from "@/lib/server/cache";
import { privateJson } from "@/lib/server/api-response";
import { reportError } from "@/lib/server/report-error";
// @ts-expect-error Shared sync helper is authored as an ESM .mjs module.
import { syncPokemonCatalog } from "@/lib/pokemon-catalog/sync.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function isAuthorizedCronRequest(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    throw new Error("Missing CRON_SECRET.");
  }

  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  try {
    if (!isAuthorizedCronRequest(request)) {
      return privateJson({ error: "Unauthorized" }, { status: 401 });
    }

    const summary = await syncPokemonCatalog({
      logger: {
        log: (...args: unknown[]) => console.log("[cron:sync-pokemon-catalog]", ...args),
        error: (...args: unknown[]) => console.error("[cron:sync-pokemon-catalog]", ...args),
      },
    });

    invalidateReferenceDataCaches();

    return privateJson({
      ok: true,
      summary,
    });
  } catch (error) {
    reportError(error, {
      action: "syncPokemonCatalogCron",
      area: "api",
      boundary: "cron-sync-pokemon-catalog-route",
      route: "/api/cron/sync-pokemon-catalog",
    });

    return privateJson(
      {
        ok: false,
        error: "Pokemon catalog sync failed."
      },
      { status: 500 }
    );
  }
}
