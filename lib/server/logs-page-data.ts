import { hydrateLogWindowDeckListNames } from "@/lib/db/log-linked-deck-list-names";
import { getLogSummaryStats, getLogsWindow } from "@/lib/db/logs";
import { getCachedInitialLogsPageDataWithDiagnostics } from "@/lib/server/logs-initial-cache";
import { measureServerCall } from "@/lib/server/perf";

export async function loadInitialLogsPageData(userId: string) {
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
      cacheOutcome: cachedReadModel.diagnostics.cacheOutcome,
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

export type InitialLogsPageData = Awaited<ReturnType<typeof loadInitialLogsPageData>>;
