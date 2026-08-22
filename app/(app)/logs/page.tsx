import { Suspense } from "react";
import { ClientRouteTimingMarker } from "@/components/ui/ClientRouteTimingMarker";
import { LogsStats } from "@/components/ui/LogsStats";
import { LogsWorkspaceClient } from "@/components/ui/LogsWorkspaceClient";
import { LogsWorkspaceFrame } from "@/components/ui/LogsWorkspaceFrame";
import { LogsStatsSkeleton, LogsWorkspaceSkeleton } from "@/components/ui/LogsWorkspaceSkeleton";
import { ProxyAuthTimingMarker, RouteTimingMarker } from "@/components/ui/RouteTimingMarker";
import { requireUser } from "@/lib/auth";
import { hydrateLogWindowDeckListNames } from "@/lib/db/log-linked-deck-list-names";
import { getLogSummaryStats, getLogsWindow } from "@/lib/db/logs";
import { getCachedInitialLogsPageData } from "@/lib/server/logs-initial-cache";
import { measureServerCall, measureServerCallWithTiming } from "@/lib/server/perf";

type LogsPerformanceVariant = "logs-delay-1000" | "logs-narrow-suspense" | "logs-shell-only";

type LogsPageProps = {
  searchParams: Promise<{ logsPerf?: string | string[] }>;
};

type InitialLogsPageData = Awaited<ReturnType<typeof loadInitialLogsPageData>>;
type TimedInitialLogsPageData = Awaited<
  ReturnType<typeof measureServerCallWithTiming<InitialLogsPageData>>
>;

export default async function LogsPage({ searchParams }: LogsPageProps) {
  const [user, resolvedSearchParams] = await Promise.all([requireUser(), searchParams]);
  const variant = resolvePerformanceVariant(resolvedSearchParams.logsPerf);

  if (variant === "logs-shell-only") {
    return (
      <>
        <ProxyAuthTimingMarker />
        <LogsWorkspaceFrame performanceVariant={variant} stats={<LogsStatsSkeleton />}>
          <LogsWorkspaceSkeleton />
        </LogsWorkspaceFrame>
      </>
    );
  }

  const initialDataPromise = measureServerCallWithTiming("page.logs.initialData", () =>
    loadInitialLogsPageDataWithDelay(user.id, variant === "logs-delay-1000" ? 1000 : 0)
  );

  return (
    <>
      <ProxyAuthTimingMarker />
      <LogsWorkspaceFrame
        performanceVariant={variant}
        stats={
          <Suspense fallback={<LogsStatsSkeleton />}>
            <LogsStatsRegion initialDataPromise={initialDataPromise} />
          </Suspense>
        }
      >
        <Suspense fallback={<LogsWorkspaceSkeleton />}>
          <LogsDataRegion initialDataPromise={initialDataPromise} />
        </Suspense>
      </LogsWorkspaceFrame>
    </>
  );
}

async function LogsStatsRegion({
  initialDataPromise
}: {
  initialDataPromise: Promise<TimedInitialLogsPageData>;
}) {
  const { stats } = (await initialDataPromise).value;
  return <LogsStats losses={stats.losses} total={stats.total} wins={stats.wins} />;
}

async function LogsDataRegion({
  initialDataPromise
}: {
  initialDataPromise: Promise<TimedInitialLogsPageData>;
}) {
  const initialDataTiming = await initialDataPromise;

  return (
    <>
      <ClientRouteTimingMarker phase="route-content-visible" />
      <ClientRouteTimingMarker phase="route-data-visible" />
      <RouteTimingMarker durationMs={initialDataTiming.durationMs} phase="route-data" />
      <LogsWorkspaceClient window={initialDataTiming.value.window} />
    </>
  );
}

function resolvePerformanceVariant(value: string | string[] | undefined): LogsPerformanceVariant {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (candidate === "delay-1000") {
    return "logs-delay-1000";
  }

  if (candidate === "shell-only") {
    return "logs-shell-only";
  }

  return "logs-narrow-suspense";
}

async function loadInitialLogsPageDataWithDelay(userId: string, delayMs: number) {
  const dataPromise = loadInitialLogsPageData(userId);

  if (delayMs <= 0) {
    return dataPromise;
  }

  const [data] = await Promise.all([
    dataPromise,
    new Promise<void>((resolve) => globalThis.setTimeout(resolve, delayMs))
  ]);

  return data;
}

async function loadInitialLogsPageData(userId: string) {
  const readModel = await getCachedInitialLogsPageData(userId);
  if (readModel) {
    return readModel;
  }

  const [stats, window] = await Promise.all([getLogSummaryStats(userId), getLogsWindow(userId)]);
  const hydratedWindow = await measureServerCall("page.logs.linkedDeckListNames", () =>
    hydrateLogWindowDeckListNames(userId, window)
  );

  return {
    stats,
    window: hydratedWindow
  };
}
