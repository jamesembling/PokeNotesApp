import { NextResponse } from "next/server";
import { reportError } from "@/lib/server/report-error";
// @ts-expect-error Shared sync helper is authored as an ESM .mjs module.
import { syncCardEffectCatalog } from "@/lib/card-effect-catalog/sync.mjs";

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const summary = await syncCardEffectCatalog({
      logger: {
        log: (...args: unknown[]) => console.log("[cron:sync-card-effect-catalog]", ...args),
        error: (...args: unknown[]) => console.error("[cron:sync-card-effect-catalog]", ...args)
      }
    });

    return NextResponse.json({
      ok: true,
      summary
    });
  } catch (error) {
    reportError(error, {
      action: "syncCardEffectCatalogCron",
      area: "api",
      boundary: "cron-sync-card-effect-catalog-route",
      route: "/api/cron/sync-card-effect-catalog"
    });

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Card effect catalog sync failed."
      },
      { status: 500 }
    );
  }
}
