import { unstable_cache, updateTag } from "next/cache";
import { getInitialLogsPageDataWithClientDiagnostics } from "@/lib/db/logs";
import { createClient } from "@/lib/supabase/server";

const INITIAL_LOGS_CACHE_SECONDS = 30;
export const INITIAL_LOGS_CACHE_KEY_VERSION = "v1";

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
    diagnostics: Awaited<ReturnType<typeof getInitialLogsPageDataWithClientDiagnostics>> | null;
  } = { diagnostics: null };
  const load = unstable_cache(
    async () => {
      source.diagnostics = await getInitialLogsPageDataWithClientDiagnostics(supabase);
      return source.diagnostics.value;
    },
    ["initial-logs-page", userId],
    {
      revalidate: INITIAL_LOGS_CACHE_SECONDS,
      tags: [getInitialLogsCacheTag(userId)]
    }
  );
  const lookupStartedAt = performance.now();
  const value = await load();
  const resultBytes = value ? new TextEncoder().encode(JSON.stringify(value)).byteLength : null;

  return {
    diagnostics: {
      cacheKeyVersion: INITIAL_LOGS_CACHE_KEY_VERSION,
      cacheLookupMs: Math.max(0, Math.round(performance.now() - lookupStartedAt)),
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
