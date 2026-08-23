import { unstable_cache, updateTag } from "next/cache";
import { getInitialLogsPageDataWithClientDiagnostics } from "@/lib/db/logs";
import { reportError } from "@/lib/server/report-error";
import { createClient } from "@/lib/supabase/server";

const INITIAL_LOGS_CACHE_SECONDS = 30;
export const INITIAL_LOGS_CACHE_KEY_VERSION = "v2";

type InitialLogsReadDiagnostics = Awaited<
  ReturnType<typeof getInitialLogsPageDataWithClientDiagnostics>
>;

export class InitialLogsCacheFillError extends Error {
  constructor(
    readonly reason: "invalid-payload" | "rpc-error",
    cause: unknown
  ) {
    super(`Initial logs cache fill failed: ${reason}.`, { cause });
    this.name = "InitialLogsCacheFillError";
  }
}

export function requireCacheableInitialLogsData(result: InitialLogsReadDiagnostics) {
  if (!result.value || result.failureReason) {
    throw new InitialLogsCacheFillError(result.failureReason ?? "invalid-payload", result.error);
  }

  return result.value;
}

export const logsInitialCacheTestHooks = {
  updateTag
};

export function getInitialLogsCacheTag(userId: string) {
  return `initial-logs:${userId}`;
}

export async function getCachedInitialLogsPageData(userId: string) {
  return (await getCachedInitialLogsPageDataWithDiagnostics(userId)).value;
}

export async function getCachedInitialLogsPageDataWithDiagnostics(userId: string) {
  const supabase = await createClient();
  const source: {
    diagnostics: InitialLogsReadDiagnostics | null;
  } = { diagnostics: null };
  const load = unstable_cache(
    async () => {
      source.diagnostics = await getInitialLogsPageDataWithClientDiagnostics(supabase);
      return requireCacheableInitialLogsData(source.diagnostics);
    },
    ["initial-logs-page", INITIAL_LOGS_CACHE_KEY_VERSION, userId],
    {
      revalidate: INITIAL_LOGS_CACHE_SECONDS,
      tags: [getInitialLogsCacheTag(userId)]
    }
  );
  const lookupStartedAt = performance.now();
  let value: Awaited<ReturnType<typeof requireCacheableInitialLogsData>> | null = null;
  let cacheError: unknown = null;

  try {
    value = await load();
  } catch (error) {
    cacheError = error;
    reportError(error, {
      action: "getCachedInitialLogsPageDataWithDiagnostics",
      area: "logs",
      boundary: "initial-logs-cache-fill",
      route: "/logs"
    });
  }

  const cacheLookupMs = Math.max(0, Math.round(performance.now() - lookupStartedAt));
  const resultBytes = value ? new TextEncoder().encode(JSON.stringify(value)).byteLength : null;

  if (!value) {
    const failureReason =
      cacheError instanceof InitialLogsCacheFillError
        ? cacheError.reason
        : source.diagnostics?.failureReason ?? "cache-error";

    return {
      diagnostics: {
        cacheKeyVersion: INITIAL_LOGS_CACHE_KEY_VERSION,
        cacheLookupMs,
        cacheOutcome: `fallback-${failureReason}` as const,
        mappingMs: source.diagnostics?.mappingMs ?? null,
        resultBytes: source.diagnostics?.resultBytes ?? null,
        resultRows: source.diagnostics?.resultRows ?? null,
        supabaseMs: source.diagnostics?.supabaseMs ?? null
      },
      value: null
    };
  }

  return {
    diagnostics: {
      cacheKeyVersion: INITIAL_LOGS_CACHE_KEY_VERSION,
      cacheLookupMs,
      cacheOutcome: source.diagnostics ? ("miss" as const) : ("hit" as const),
      mappingMs: source.diagnostics?.mappingMs ?? null,
      resultBytes: source.diagnostics?.resultBytes ?? resultBytes,
      resultRows: source.diagnostics?.resultRows ?? value?.window.logs.length ?? null,
      supabaseMs: source.diagnostics?.supabaseMs ?? null
    },
    value
  };
}

export function invalidateInitialLogsCache(userId: string) {
  logsInitialCacheTestHooks.updateTag(getInitialLogsCacheTag(userId));
}
