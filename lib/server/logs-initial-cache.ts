import { unstable_cache, updateTag } from "next/cache";
import { getInitialLogsPageDataWithClient } from "@/lib/db/logs";
import { createClient } from "@/lib/supabase/server";

const INITIAL_LOGS_CACHE_SECONDS = 30;

export const logsInitialCacheTestHooks = {
  updateTag
};

export function getInitialLogsCacheTag(userId: string) {
  return `initial-logs:${userId}`;
}

export async function getCachedInitialLogsPageData(userId: string) {
  const supabase = await createClient();
  const load = unstable_cache(
    async () => getInitialLogsPageDataWithClient(supabase),
    ["initial-logs-page", userId],
    {
      revalidate: INITIAL_LOGS_CACHE_SECONDS,
      tags: [getInitialLogsCacheTag(userId)]
    }
  );

  return load();
}

export function invalidateInitialLogsCache(userId: string) {
  logsInitialCacheTestHooks.updateTag(getInitialLogsCacheTag(userId));
}
