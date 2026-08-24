import { Suspense } from "react";
import { ClientRouteTimingMarker } from "@/components/ui/ClientRouteTimingMarker";
import { LogsStats } from "@/components/ui/LogsStats";
import {
  LogsLastKnownContent,
  LogsLastKnownStats
} from "@/components/ui/LogsLastKnownState";
import { LogsWorkspaceClient } from "@/components/ui/LogsWorkspaceClient";
import { LogsWorkspaceFrame } from "@/components/ui/LogsWorkspaceFrame";
import { LogsStatsSkeleton, LogsWorkspaceSkeleton } from "@/components/ui/LogsWorkspaceSkeleton";
import { ParserRouteTimingMarker } from "@/components/ui/ParserRouteTimingMarker";
import { ProxyAuthTimingMarker, RouteDataTimingMarker } from "@/components/ui/RouteTimingMarker";
import { requireUser } from "@/lib/auth";
import { loadInitialLogsPageData } from "@/lib/server/logs-page-data";
import {
  measureServerCallWithTimeline,
  takeRouteEntryEpochMs
} from "@/lib/server/perf";

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
  const routeEnteredAtEpochMs = takeRouteEntryEpochMs();
  const [user, resolvedSearchParams] = await Promise.all([requireUser(), searchParams]);
  const variant = resolvePerformanceVariant(resolvedSearchParams.logsPerf);

  if (variant === "logs-shell-only") {
    return (
      <>
        <ProxyAuthTimingMarker routeEnteredAtEpochMs={routeEnteredAtEpochMs} />
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
      <ProxyAuthTimingMarker routeEnteredAtEpochMs={routeEnteredAtEpochMs} />
      <LogsWorkspaceFrame
        performanceVariant={variant}
        stats={
          <Suspense fallback={<LogsLastKnownStats />}>
            <LogsStatsRegion initialDataPromise={initialDataPromise} />
          </Suspense>
        }
      >
        <Suspense fallback={<LogsLastKnownContent />}>
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
      <LogsWorkspaceClient
        stats={initialDataTiming.value.stats}
        window={initialDataTiming.value.window}
      />
      <ParserRouteTimingMarker phase="route-data-parsed" />
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
