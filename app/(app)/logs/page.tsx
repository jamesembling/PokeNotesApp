import { Suspense } from "react";
import { ClientRouteTimingMarker } from "@/components/ui/ClientRouteTimingMarker";
import { LogsStats } from "@/components/ui/LogsStats";
import { LogsWorkspaceClient } from "@/components/ui/LogsWorkspaceClient";
import { LogsWorkspaceFrame } from "@/components/ui/LogsWorkspaceFrame";
import { LogsStatsSkeleton, LogsWorkspaceSkeleton } from "@/components/ui/LogsWorkspaceSkeleton";
import { ParserRouteTimingMarker } from "@/components/ui/ParserRouteTimingMarker";
import { ProxyAuthTimingMarker, RouteDataTimingMarker } from "@/components/ui/RouteTimingMarker";
import { requireUser } from "@/lib/auth";
import { hydrateLogWindowDeckListNames } from "@/lib/db/log-linked-deck-list-names";
import { getLogSummaryStats, getLogsWindow } from "@/lib/db/logs";
import { getCachedInitialLogsPageDataWithDiagnostics } from "@/lib/server/logs-initial-cache";
import { measureServerCall, measureServerCallWithTimeline } from "@/lib/server/perf";

type LogsPerformanceVariant =
  "logs-delay-400" | "logs-delay-1000" | "logs-narrow-suspense" | "logs-shell-only";

type LogsPageProps = {
  searchParams: Promise<{ logsPerf?: string | string[] }>;
};

type InitialLogsPageData = Awaited<ReturnType<typeof loadInitialLogsPageData>>;
type TimedInitialLogsPageData = Awaited<
  ReturnType<typeof measureServerCallWithTimeline<InitialLogsPageData>>
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

  const delayMs = variant === "logs-delay-1000" ? 1000 : variant === "logs-delay-400" ? 400 : 0;
  const initialDataPromise = measureServerCallWithTimeline("page.logs.initialData", () =>
    loadInitialLogsPageDataWithDelay(user.id, delayMs)
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
  const { diagnostics } = initialDataTiming.value;

  return (
    <>
      <ParserRouteTimingMarker phase="route-data-parsed" />
      <RouteDataTimingMarker
        cacheKeyVersion={diagnostics.cacheKeyVersion}
        cacheLookupMs={diagnostics.cacheLookupMs}
        cacheOutcome={diagnostics.cacheOutcome}
        durationMs={initialDataTiming.durationMs}
        endedAtEpochMs={initialDataTiming.endedAtEpochMs}
        mappingMs={diagnostics.mappingMs}
        resultBytes={diagnostics.resultBytes}
        resultRows={diagnostics.resultRows}
        startedAtEpochMs={initialDataTiming.startedAtEpochMs}
        supabaseMs={diagnostics.supabaseMs}
      />
      <LogsWorkspaceClient window={initialDataTiming.value.window} />
      <ClientRouteTimingMarker phase="route-content-visible" />
      <ClientRouteTimingMarker phase="route-data-visible" />
    </>
  );
}

function resolvePerformanceVariant(value: string | string[] | undefined): LogsPerformanceVariant {
  const candidate = Array.isArray(value) ? value[0] : value;
  const canUseDiagnosticVariant =
    process.env.NODE_ENV !== "production" || process.env.POKE_NOTES_PERF_CANARY_ENABLED === "1";

  if (!canUseDiagnosticVariant) {
    return "logs-narrow-suspense";
  }

  if (candidate === "delay-1000") {
    return "logs-delay-1000";
  }

  if (candidate === "delay-400") {
    return "logs-delay-400";
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
  const cachedReadModel = await getCachedInitialLogsPageDataWithDiagnostics(userId);
  if (cachedReadModel.value) {
    return {
      ...cachedReadModel.value,
      diagnostics: cachedReadModel.diagnostics
    };
  }

  const fallbackStartedAt = performance.now();
  const [stats, window] = await Promise.all([getLogSummaryStats(userId), getLogsWindow(userId)]);
  const hydratedWindow = await measureServerCall("page.logs.linkedDeckListNames", () =>
    hydrateLogWindowDeckListNames(userId, window)
  );
  const fallbackMs = Math.max(0, Math.round(performance.now() - fallbackStartedAt));

  return {
    diagnostics: {
      cacheKeyVersion: cachedReadModel.diagnostics.cacheKeyVersion,
      cacheLookupMs: cachedReadModel.diagnostics.cacheLookupMs,
      cacheOutcome: "fallback" as const,
      mappingMs: null,
      resultBytes: new TextEncoder().encode(JSON.stringify({ stats, window: hydratedWindow }))
        .byteLength,
      resultRows: hydratedWindow.logs.length,
      supabaseMs: fallbackMs
    },
    stats,
    window: hydratedWindow
  };
}
