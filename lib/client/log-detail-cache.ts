import type { BattleLog } from "@/types/index";

type CachedLogDetail = {
  cachedAt: number;
  log: BattleLog;
};

type LogDetailDataResponse = {
  log?: BattleLog;
};

const CACHE_PREFIX = "poke-notes:log-detail:";
const CACHE_TTL_MS = 60_000;
const warmedLogIds = new Set<string>();

function getCacheKey(logId: string) {
  return `${CACHE_PREFIX}${logId}`;
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export function readCachedLogDetail(logId: string) {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(getCacheKey(logId));
    if (!raw) {
      return null;
    }

    const cached = JSON.parse(raw) as CachedLogDetail;
    if (!cached.log || Date.now() - cached.cachedAt > CACHE_TTL_MS) {
      window.sessionStorage.removeItem(getCacheKey(logId));
      return null;
    }

    return cached.log;
  } catch {
    return null;
  }
}

export function writeCachedLogDetail(log: BattleLog) {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.sessionStorage.setItem(
      getCacheKey(log.id),
      JSON.stringify({
        cachedAt: Date.now(),
        log
      } satisfies CachedLogDetail)
    );
  } catch {
    // Storage can be unavailable in private modes or low-space conditions.
  }
}

export async function fetchLogDetail(logId: string, signal?: AbortSignal) {
  const response = await fetch(`/api/log-detail-data?id=${encodeURIComponent(logId)}`, {
    cache: "no-store",
    credentials: "same-origin",
    signal
  });

  if (!response.ok) {
    throw new Error("Could not load battle log.");
  }

  const payload = (await response.json()) as LogDetailDataResponse;
  if (!payload.log) {
    throw new Error("Battle log not found.");
  }

  writeCachedLogDetail(payload.log);
  return payload.log;
}

export function warmLogDetailCache(logIds: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  const idsToWarm = logIds
    .filter((logId) => !warmedLogIds.has(logId) && !readCachedLogDetail(logId))
    .slice(0, 4);

  if (idsToWarm.length === 0) {
    return;
  }

  idsToWarm.forEach((logId) => warmedLogIds.add(logId));

  const warm = () => {
    idsToWarm.forEach((logId) => {
      void fetchLogDetail(logId).catch(() => {
        warmedLogIds.delete(logId);
      });
    });
  };

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(warm, { timeout: 1500 });
    return;
  }

  globalThis.setTimeout(warm, 250);
}
