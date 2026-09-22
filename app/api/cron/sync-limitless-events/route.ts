import { privateJson } from "@/lib/server/api-response";
import { reportError } from "@/lib/server/report-error";
import { refreshUpcomingLimitlessSnapshot } from "@/lib/tournaments/limitless-upcoming";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return privateJson({ error: "Unauthorized" }, { status: 401 });
    }

    const summary = await refreshUpcomingLimitlessSnapshot();
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
