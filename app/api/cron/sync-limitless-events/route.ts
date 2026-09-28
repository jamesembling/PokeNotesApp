import { privateJson } from "@/lib/server/api-response";
import { reportError } from "@/lib/server/report-error";
import { isAuthorizedLimitlessSync, parseLimitlessRefreshMode } from "@/lib/tournaments/limitless-sync-auth";
import { refreshUpcomingLimitlessSnapshot } from "@/lib/tournaments/limitless-upcoming";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    if (!isAuthorizedLimitlessSync(
      request.headers.get("authorization"),
      process.env.CRON_SECRET,
      process.env.LIMITLESS_SYNC_SECRET
    )) {
      return privateJson({ error: "Unauthorized" }, { status: 401 });
    }

    const mode = parseLimitlessRefreshMode(request.url);
    if (!mode) {
      return privateJson({ error: "Invalid refresh mode" }, { status: 400 });
    }
    const summary = await refreshUpcomingLimitlessSnapshot(mode);
    return privateJson({ ok: true, summary });
  } catch (error) {
    reportError(error, {
      action: "syncLimitlessEventsCron",
      area: "api",
      boundary: "cron-sync-limitless-events-route",
      route: "/api/cron/sync-limitless-events"
    });
    return privateJson({ ok: false, error: "Limitless event sync failed." }, { status: 500 });
  }
}
