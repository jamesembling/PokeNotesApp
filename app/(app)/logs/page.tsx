import { ClientRouteTimingMarker } from "@/components/ui/ClientRouteTimingMarker";
import { LogsWorkspaceClient } from "@/components/ui/LogsWorkspaceClient";
import {
  ProxyAuthTimingMarker,
  RouteTimingMarker
} from "@/components/ui/RouteTimingMarker";
import { requireUser } from "@/lib/auth";
import { hydrateLogWindowDeckListNames } from "@/lib/db/log-linked-deck-list-names";
import { getLogSummaryStats, getLogsWindow } from "@/lib/db/logs";
import { getCachedInitialLogsPageData } from "@/lib/server/logs-initial-cache";
import { measureServerCall, measureServerCallWithTiming } from "@/lib/server/perf";

export default async function LogsPage() {
  const user = await requireUser();
  const initialDataTiming = await measureServerCallWithTiming("page.logs.initialData", () =>
    loadInitialLogsPageData(user.id)
  );
  const { stats, window } = initialDataTiming.value;

  return (
    <>
      <ProxyAuthTimingMarker />
      <div className="-mx-4 -my-6 flex min-h-dvh flex-col gap-6 bg-background px-4 py-6 text-foreground sm:-mx-6 sm:-my-8 sm:px-6 sm:py-8 lg:-mx-8 lg:px-8">
        <ClientRouteTimingMarker phase="route-content-visible" />
        <RouteTimingMarker durationMs={initialDataTiming.durationMs} phase="route-data" />
        <LogsWorkspaceClient stats={stats} window={window} />
      </div>
    </>
  );
}

async function loadInitialLogsPageData(userId: string) {
  const readModel = await getCachedInitialLogsPageData(userId);
  if (readModel) {
    return readModel;
  }

  const [stats, window] = await Promise.all([
    getLogSummaryStats(userId),
    getLogsWindow(userId)
  ]);
  const hydratedWindow = await measureServerCall("page.logs.linkedDeckListNames", () =>
    hydrateLogWindowDeckListNames(userId, window)
  );

  return {
    stats,
    window: hydratedWindow
  };
}
