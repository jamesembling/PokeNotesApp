import type { BattleLog } from "@/types/index";
import type { DeckCard } from "@/types/index";

type CachedLogDetail = {
  cachedAt: number;
  detail: LogDetailPayload;
};

export type LogDetailContext = {
  linkedDeckId?: string;
  linkedDeckListFormat?: string;
  linkedDeckListId?: string;
  linkedDeckListName?: string;
  linkedDeckListNotes?: string;
  linkedDeckListRawList?: string;
  linkedDeckListSortedCards?: DeckCard[];
  linkedStrategyLabel?: string;
};

export type LogDetailPayload = {
  context?: LogDetailContext;
  log: BattleLog;
};

const CACHE_PREFIX = "poke-notes:log-detail:";
const CACHE_TTL_MS = 60_000;
const MAX_WARMED_LOG_DETAILS = 2;
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
    if (!cached.detail?.log || Date.now() - cached.cachedAt > CACHE_TTL_MS) {
      window.sessionStorage.removeItem(getCacheKey(logId));
      return null;
    }

    return cached.detail;
  } catch {
    return null;
  }
}

export function writeCachedLogDetail(detail: LogDetailPayload) {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.sessionStorage.setItem(
      getCacheKey(detail.log.id),
      JSON.stringify({
        cachedAt: Date.now(),
        detail
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

  const payload = (await response.json()) as Partial<LogDetailPayload>;
  if (!payload.log) {
    throw new Error("Battle log not found.");
  }

  const detail = {
    context: payload.context,
    log: payload.log
  };
  writeCachedLogDetail(detail);
  return detail;
}

export function warmLogDetailCache(logIds: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  const remainingWarmSlots = Math.max(0, MAX_WARMED_LOG_DETAILS - warmedLogIds.size);
  if (remainingWarmSlots === 0) {
    return;
  }

  const idsToWarm = logIds
    .filter((logId) => !warmedLogIds.has(logId) && !readCachedLogDetail(logId))
    .slice(0, remainingWarmSlots);

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
