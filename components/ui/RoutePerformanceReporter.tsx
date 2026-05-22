"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

type PendingNavigation = {
  fromPath: string;
  loadingStartedAt: number | null;
  resourceStartedAt: number;
  sawLoading: boolean;
  startedAt: number;
  toPath: string;
};

type NavigatorConnection = {
  downlink?: number;
  effectiveType?: string;
  rtt?: number;
  saveData?: boolean;
};

type NavigatorWithHints = Navigator & {
  connection?: NavigatorConnection;
  deviceMemory?: number;
};

type LongTaskEntry = {
  duration: number;
  startTime: number;
};

const REPORT_ENDPOINT = "/api/performance-events";
const NAVIGATION_RESOURCE_LOOKBACK_MS = 1200;
const LONG_TASK_ENTRY_RETENTION_MS = 300000;
const UUID_SEGMENT_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizePath(path: string) {
  const [pathname] = path.split("?");

  return pathname
    .split("/")
    .map((segment) => (UUID_SEGMENT_PATTERN.test(segment) ? ":id" : segment))
    .join("/");
}

function getCurrentPath() {
  return normalizePath(`${window.location.pathname}${window.location.search}`);
}

function getLoadingElement() {
  return document.querySelector("[data-route-loading]");
}

function getNavigationTiming() {
  return performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
}

function shouldIncludeResource(entry: PerformanceEntry, endedAt: number) {
  if (entry.startTime > endedAt || !entry.name.startsWith(window.location.origin)) {
    return false;
  }

  const pathname = normalizePath(new URL(entry.name).pathname);
  return pathname !== REPORT_ENDPOINT;
}

function getSlowestResourceSince(startedAt: number, endedAt = performance.now()) {
  const sameOriginPrefix = window.location.origin;
  const resources = performance
    .getEntriesByType("resource")
    .filter(
      (entry) =>
        entry.startTime >= startedAt &&
        entry.name.startsWith(sameOriginPrefix) &&
        shouldIncludeResource(entry, endedAt)
    );
  const slowest = resources.reduce<PerformanceResourceTiming | null>((current, entry) => {
    const resource = entry as PerformanceResourceTiming;

    if (!current || resource.duration > current.duration) {
      return resource;
    }

    return current;
  }, null);

  return {
    resourceCount: resources.length,
    slowestResourceMs: slowest ? Math.round(slowest.duration) : null,
    slowestResourcePath: slowest
      ? normalizePath(new URL(slowest.name).pathname)
      : null,
    transferSizeBytes: slowest?.transferSize ?? null
  };
}

function getLongTaskStatsSince(entries: LongTaskEntry[], startedAt: number, endedAt: number) {
  return entries
    .filter((entry) => entry.startTime >= startedAt && entry.startTime <= endedAt)
    .reduce(
      (stats, entry) => ({
        maxLongTaskMs: Math.max(stats.maxLongTaskMs, entry.duration),
        totalBlockingTimeMs: stats.totalBlockingTimeMs + Math.max(0, entry.duration - 50)
      }),
      { maxLongTaskMs: 0, totalBlockingTimeMs: 0 }
    );
}

function getDeviceSnapshot() {
  const typedNavigator = navigator as NavigatorWithHints;
  const connection = typedNavigator.connection;

  return {
    deploymentEnv:
      window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
        ? "local"
        : window.location.hostname.endsWith(".vercel.app")
          ? "production"
          : "unknown",
    deviceMemory: typeof typedNavigator.deviceMemory === "number" ? typedNavigator.deviceMemory : null,
    downlink: typeof connection?.downlink === "number" ? connection.downlink : null,
    effectiveType: connection?.effectiveType ?? null,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    rtt: typeof connection?.rtt === "number" ? connection.rtt : null,
    saveData: Boolean(connection?.saveData),
    screenHeight: window.screen.height,
    screenWidth: window.screen.width,
    sourceHost: window.location.host,
    sourceOrigin: window.location.origin,
    userAgent: navigator.userAgent,
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth
  };
}

function sendPerformanceEvent(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });

    if (navigator.sendBeacon(REPORT_ENDPOINT, blob)) {
      return;
    }
  }

  void fetch(REPORT_ENDPOINT, {
    body,
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json"
    },
    keepalive: true,
    method: "POST"
  }).catch(() => {});
}

export function RoutePerformanceReporter() {
  const pathname = usePathname();
  const currentPathRef = useRef(pathname);
  const longTaskEntriesRef = useRef<LongTaskEntry[]>([]);
  const longTaskStatsRef = useRef({ maxLongTaskMs: 0, totalBlockingTimeMs: 0 });
  const pendingNavigationRef = useRef<PendingNavigation | null>(null);

  useEffect(() => {
    currentPathRef.current = normalizePath(pathname);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let longTaskObserver: PerformanceObserver | null = null;

    if (typeof PerformanceObserver !== "undefined") {
      try {
        longTaskObserver = new PerformanceObserver((entryList) => {
          const retentionStart = Math.max(0, performance.now() - LONG_TASK_ENTRY_RETENTION_MS);
          longTaskEntriesRef.current = longTaskEntriesRef.current.filter(
            (entry) => entry.startTime >= retentionStart
          );

          for (const entry of entryList.getEntries()) {
            longTaskEntriesRef.current.push({
              duration: entry.duration,
              startTime: entry.startTime
            });
            longTaskStatsRef.current.maxLongTaskMs = Math.max(
              longTaskStatsRef.current.maxLongTaskMs,
              entry.duration
            );
            longTaskStatsRef.current.totalBlockingTimeMs += Math.max(0, entry.duration - 50);
          }
        });
        longTaskObserver.observe({ type: "longtask", buffered: true });
      } catch {}
    }

    const hardLoadTimeoutId = window.setTimeout(() => {
      const nav = getNavigationTiming();
      const measuredAt = performance.now();
      const resourceSnapshot = getSlowestResourceSince(0, measuredAt);

      sendPerformanceEvent({
        ...getDeviceSnapshot(),
        ...resourceSnapshot,
        domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
        durationMs: nav ? Math.round(nav.duration) : Math.round(performance.now()),
        eventType: "hard-load",
        fromPath: null,
        loadEventMs: nav ? Math.round(nav.loadEventEnd) : null,
        loadingMs: null,
        maxLongTaskMs: Math.round(longTaskStatsRef.current.maxLongTaskMs),
        toPath: getCurrentPath(),
        totalBlockingTimeMs: Math.round(longTaskStatsRef.current.totalBlockingTimeMs),
        ttfbMs: nav ? Math.round(nav.responseStart) : null
      });
    }, 2500);

    return () => {
      window.clearTimeout(hardLoadTimeoutId);
      longTaskObserver?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    function finishPendingNavigationIfReady() {
      const pendingNavigation = pendingNavigationRef.current;

      if (!pendingNavigation || pendingNavigation.toPath !== getCurrentPath() || getLoadingElement()) {
        return;
      }

      const finishedAt = performance.now();
      const resourceSnapshot = getSlowestResourceSince(
        pendingNavigation.resourceStartedAt,
        finishedAt
      );
      const longTaskSnapshot = getLongTaskStatsSince(
        longTaskEntriesRef.current,
        pendingNavigation.startedAt,
        finishedAt
      );

      sendPerformanceEvent({
        ...getDeviceSnapshot(),
        ...resourceSnapshot,
        domContentLoadedMs: null,
        durationMs: Math.round(finishedAt - pendingNavigation.startedAt),
        eventType: "app-route",
        fromPath: pendingNavigation.fromPath,
        loadEventMs: null,
        loadingMs:
          pendingNavigation.sawLoading && pendingNavigation.loadingStartedAt !== null
            ? Math.round(finishedAt - pendingNavigation.loadingStartedAt)
            : null,
        maxLongTaskMs: Math.round(longTaskSnapshot.maxLongTaskMs),
        toPath: pendingNavigation.toPath,
        totalBlockingTimeMs: Math.round(longTaskSnapshot.totalBlockingTimeMs),
        ttfbMs: null
      });
      pendingNavigationRef.current = null;
    }

    function updateLoadingState() {
      const pendingNavigation = pendingNavigationRef.current;

      if (!pendingNavigation) {
        return;
      }

      if (getLoadingElement()) {
        pendingNavigation.sawLoading = true;
        pendingNavigation.loadingStartedAt ??= performance.now();
        return;
      }

      finishPendingNavigationIfReady();
    }

    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const link = (event.target as Element | null)?.closest("a[href]");

      if (!(link instanceof HTMLAnchorElement) || link.target || link.download) {
        return;
      }

      const destination = new URL(link.href, window.location.href);

      if (destination.origin !== window.location.origin) {
        return;
      }

      const toPath = normalizePath(`${destination.pathname}${destination.search}`);
      const fromPath = getCurrentPath();

      if (toPath === fromPath) {
        return;
      }

      const startedAt = performance.now();

      pendingNavigationRef.current = {
        fromPath,
        loadingStartedAt: getLoadingElement() ? performance.now() : null,
        resourceStartedAt: Math.max(0, startedAt - NAVIGATION_RESOURCE_LOOKBACK_MS),
        sawLoading: Boolean(getLoadingElement()),
        startedAt,
        toPath
      };
    }

    const observer = new MutationObserver(updateLoadingState);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", handleClick, { capture: true });

    return () => {
      document.removeEventListener("click", handleClick, { capture: true });
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      const pendingNavigation = pendingNavigationRef.current;

      if (!pendingNavigation || pendingNavigation.toPath !== getCurrentPath() || getLoadingElement()) {
        return;
      }

      const finishedAt = performance.now();
      const resourceSnapshot = getSlowestResourceSince(
        pendingNavigation.resourceStartedAt,
        finishedAt
      );

      sendPerformanceEvent({
        ...getDeviceSnapshot(),
        ...resourceSnapshot,
        domContentLoadedMs: null,
        durationMs: Math.round(finishedAt - pendingNavigation.startedAt),
        eventType: "app-route",
        fromPath: pendingNavigation.fromPath,
        loadEventMs: null,
        loadingMs:
          pendingNavigation.sawLoading && pendingNavigation.loadingStartedAt !== null
            ? Math.round(finishedAt - pendingNavigation.loadingStartedAt)
            : null,
        maxLongTaskMs: Math.round(longTaskStatsRef.current.maxLongTaskMs),
        toPath: pendingNavigation.toPath,
        totalBlockingTimeMs: Math.round(longTaskStatsRef.current.totalBlockingTimeMs),
        ttfbMs: null
      });
      pendingNavigationRef.current = null;
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [pathname]);

  return null;
}
