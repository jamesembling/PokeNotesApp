"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  getNavigationReportDecision,
  ROUTE_REPORTER_VERSION
} from "@/lib/performance/route-performance";

type PendingNavigation = {
  fromPath: string;
  loadingEndedAt: number | null;
  loadingStartedAt: number | null;
  pathReadyAt: number | null;
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

type ServerTimingSource = PerformanceNavigationTiming | PerformanceResourceTiming;

const REPORT_ENDPOINT = "/api/performance-events";
const AUTOMATION_HASH = "#pokenotes-perf";
const AUTOMATION_SESSION_KEY = "poke-notes:performance-automation";
const NAVIGATION_RESOURCE_LOOKBACK_MS = 50;
const LONG_TASK_ENTRY_RETENTION_MS = 300000;
const HARD_LOAD_FALLBACK_MS = 10000;
const UUID_SEGMENT_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizePath(path: string) {
  const [pathname] = path.split(/[?#]/);

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
  if (
    entry.startTime > endedAt ||
    entry.startTime + entry.duration > endedAt ||
    !entry.name.startsWith(window.location.origin)
  ) {
    return false;
  }

  const pathname = normalizePath(new URL(entry.name).pathname);
  return pathname !== REPORT_ENDPOINT;
}

function getResourcesSince(startedAt: number, endedAt = performance.now()) {
  return performance
    .getEntriesByType("resource")
    .filter(
      (entry) => entry.startTime >= startedAt && shouldIncludeResource(entry, endedAt)
    ) as PerformanceResourceTiming[];
}

function getSlowestResourceSince(startedAt: number, endedAt = performance.now()) {
  const resources = getResourcesSince(startedAt, endedAt);
  const slowest = resources.reduce<PerformanceResourceTiming | null>((current, resource) => {
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

function getLatestResourceEndSince(startedAt: number, endedAt: number) {
  return getResourcesSince(startedAt, endedAt).reduce(
    (latest, resource) => Math.max(latest, resource.responseEnd || resource.startTime + resource.duration),
    0
  );
}

function getServerTimingDuration(entries: ServerTimingSource[], name: string) {
  return entries.reduce((maximum, entry) => {
    const metric = entry.serverTiming?.find((serverTiming) => serverTiming.name === name);
    return Math.max(maximum, metric?.duration ?? 0);
  }, 0);
}

function getMarkerDuration(phase: "proxy-auth" | "route-data" | "shell-profile") {
  const markers = document.querySelectorAll<HTMLElement>(
    `[data-route-server-timing="${phase}"]`
  );
  const marker = markers.item(markers.length - 1);
  const duration = Number(marker?.dataset.routeServerTimingMs);

  return Number.isFinite(duration) ? Math.max(0, Math.round(duration)) : null;
}

function getServerTimingSnapshot(
  startedAt: number,
  endedAt: number,
  navigation?: PerformanceNavigationTiming
) {
  const sources: ServerTimingSource[] = navigation
    ? [navigation]
    : getResourcesSince(startedAt, endedAt);
  const proxyAuthDuration = getServerTimingDuration(sources, "proxy-auth");
  const proxyAuthMarkerDuration = getMarkerDuration("proxy-auth");

  return {
    serverAuthMs:
      proxyAuthMarkerDuration ??
      (proxyAuthDuration > 0 ? Math.round(proxyAuthDuration) : null),
    serverRouteDataMs: getMarkerDuration("route-data"),
    serverShellProfileMs: navigation ? getMarkerDuration("shell-profile") : null
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

function getAutomationHint() {
  try {
    if (window.location.hash === AUTOMATION_HASH) {
      window.sessionStorage.setItem(AUTOMATION_SESSION_KEY, "1");
    }

    return navigator.webdriver || window.sessionStorage.getItem(AUTOMATION_SESSION_KEY) === "1";
  } catch {
    return navigator.webdriver;
  }
}

function getDeviceSnapshot() {
  const typedNavigator = navigator as NavigatorWithHints;
  const connection = typedNavigator.connection;
  const hostname = window.location.hostname;

  return {
    automationHint: getAutomationHint(),
    deploymentEnv:
      hostname === "localhost" || hostname === "127.0.0.1"
        ? "local"
        : hostname === "poke-notes-app.vercel.app"
          ? "production"
          : hostname.endsWith(".vercel.app")
            ? "preview"
            : "unknown",
    deviceMemory: typeof typedNavigator.deviceMemory === "number" ? typedNavigator.deviceMemory : null,
    downlink: typeof connection?.downlink === "number" ? connection.downlink : null,
    effectiveType: connection?.effectiveType ?? null,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    reporterVersion: ROUTE_REPORTER_VERSION,
    rtt: typeof connection?.rtt === "number" ? connection.rtt : null,
    saveData: Boolean(connection?.saveData),
    screenHeight: window.screen.height,
    screenWidth: window.screen.width,
    sourceHost: window.location.host,
    sourceOrigin: window.location.origin,
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth,
    visibilityState: document.visibilityState
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
  const longTaskEntriesRef = useRef<LongTaskEntry[]>([]);
  const longTaskStatsRef = useRef({ maxLongTaskMs: 0, totalBlockingTimeMs: 0 });
  const pendingNavigationRef = useRef<PendingNavigation | null>(null);
  const scheduleNavigationCheckRef = useRef<() => void>(() => {});

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

    let hardLoadReported = false;

    function reportHardLoad() {
      if (hardLoadReported) {
        return;
      }

      hardLoadReported = true;
      const nav = getNavigationTiming();
      const measuredAt = performance.now();
      const hardLoadEndedAt = nav && nav.loadEventEnd > 0 ? nav.loadEventEnd : measuredAt;
      const hardLoadDuration =
        nav && nav.loadEventEnd > 0
          ? nav.loadEventEnd
          : nav
            ? Math.min(nav.duration || measuredAt, measuredAt)
            : measuredAt;
      const resourceSnapshot = getSlowestResourceSince(0, hardLoadEndedAt);
      const responseEndMs = nav && nav.responseEnd > 0 ? Math.round(nav.responseEnd) : null;
      const responseStartMs = nav && nav.responseStart > 0 ? Math.round(nav.responseStart) : null;

      sendPerformanceEvent({
        ...getDeviceSnapshot(),
        ...resourceSnapshot,
        ...getServerTimingSnapshot(0, hardLoadEndedAt, nav),
        documentDownloadMs:
          responseEndMs !== null && responseStartMs !== null
            ? Math.max(0, responseEndMs - responseStartMs)
            : null,
        domContentLoadedMs:
          nav && nav.domContentLoadedEventEnd > 0
            ? Math.round(nav.domContentLoadedEventEnd)
            : null,
        durationMs: Math.round(hardLoadDuration),
        eventType: "hard-load",
        fromPath: null,
        loadEventMs: nav && nav.loadEventEnd > 0 ? Math.round(nav.loadEventEnd) : null,
        loadingMs: null,
        maxLongTaskMs: Math.round(longTaskStatsRef.current.maxLongTaskMs),
        navigationType: nav?.type ?? "unknown",
        responseEndMs,
        routeStabilizationMs: null,
        toPath: getCurrentPath(),
        totalBlockingTimeMs: Math.round(longTaskStatsRef.current.totalBlockingTimeMs),
        ttfbMs: responseStartMs
      });
    }

    const hardLoadTimeoutId = window.setTimeout(reportHardLoad, HARD_LOAD_FALLBACK_MS);
    const reportHardLoadAfterLoad = () => {
      window.requestAnimationFrame(reportHardLoad);
    };

    if (document.readyState === "complete") {
      reportHardLoadAfterLoad();
    } else {
      window.addEventListener("load", reportHardLoadAfterLoad, { once: true });
    }

    return () => {
      window.clearTimeout(hardLoadTimeoutId);
      window.removeEventListener("load", reportHardLoadAfterLoad);
      longTaskObserver?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let settleTimeoutId: number | null = null;
    let resourceObserver: PerformanceObserver | null = null;

    function scheduleNavigationCheck(delayMs = 0) {
      if (settleTimeoutId !== null) {
        window.clearTimeout(settleTimeoutId);
      }

      settleTimeoutId = window.setTimeout(finishPendingNavigationIfReady, delayMs);
    }

    function finishPendingNavigationIfReady() {
      const pendingNavigation = pendingNavigationRef.current;

      if (!pendingNavigation || pendingNavigation.toPath !== getCurrentPath()) {
        return;
      }

      const observedAt = performance.now();
      pendingNavigation.pathReadyAt ??= observedAt;

      if (getLoadingElement()) {
        pendingNavigation.sawLoading = true;
        pendingNavigation.loadingStartedAt ??= observedAt;
        pendingNavigation.loadingEndedAt = null;
        scheduleNavigationCheck(50);
        return;
      }

      if (pendingNavigation.sawLoading && pendingNavigation.loadingEndedAt === null) {
        pendingNavigation.loadingEndedAt = observedAt;
      }

      const latestResourceEndAt = getLatestResourceEndSince(
        pendingNavigation.resourceStartedAt,
        observedAt
      );
      const candidateCompletedAt = Math.max(
        pendingNavigation.pathReadyAt,
        pendingNavigation.loadingEndedAt ?? 0,
        latestResourceEndAt
      );
      const decision = getNavigationReportDecision({
        candidateCompletedAt,
        observedAt,
        pathReadyAt: pendingNavigation.pathReadyAt,
        startedAt: pendingNavigation.startedAt
      });

      if (!decision.shouldReport) {
        scheduleNavigationCheck(decision.nextCheckMs);
        return;
      }

      const resourceSnapshot = getSlowestResourceSince(
        pendingNavigation.resourceStartedAt,
        candidateCompletedAt
      );
      const longTaskSnapshot = getLongTaskStatsSince(
        longTaskEntriesRef.current,
        pendingNavigation.startedAt,
        candidateCompletedAt
      );

      sendPerformanceEvent({
        ...getDeviceSnapshot(),
        ...resourceSnapshot,
        ...getServerTimingSnapshot(
          pendingNavigation.resourceStartedAt,
          candidateCompletedAt
        ),
        documentDownloadMs: null,
        domContentLoadedMs: null,
        durationMs: Math.round(candidateCompletedAt - pendingNavigation.startedAt),
        eventType: "app-route",
        fromPath: pendingNavigation.fromPath,
        loadEventMs: null,
        loadingMs:
          pendingNavigation.sawLoading && pendingNavigation.loadingStartedAt !== null
            ? Math.round(candidateCompletedAt - pendingNavigation.loadingStartedAt)
            : null,
        maxLongTaskMs: Math.round(longTaskSnapshot.maxLongTaskMs),
        navigationType: "app-route",
        responseEndMs: null,
        routeStabilizationMs: decision.stabilizationMs,
        toPath: pendingNavigation.toPath,
        totalBlockingTimeMs: Math.round(longTaskSnapshot.totalBlockingTimeMs),
        ttfbMs: null
      });
      pendingNavigationRef.current = null;
    }

    function handleClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
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
        loadingEndedAt: null,
        loadingStartedAt: getLoadingElement() ? startedAt : null,
        pathReadyAt: null,
        resourceStartedAt: Math.max(0, startedAt - NAVIGATION_RESOURCE_LOOKBACK_MS),
        sawLoading: Boolean(getLoadingElement()),
        startedAt,
        toPath
      };
      scheduleNavigationCheck();
    }

    const mutationObserver = new MutationObserver(() => scheduleNavigationCheck());
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    if (typeof PerformanceObserver !== "undefined") {
      try {
        resourceObserver = new PerformanceObserver((entryList) => {
          const pendingNavigation = pendingNavigationRef.current;
          if (!pendingNavigation) {
            return;
          }

          const hasRelevantResource = entryList.getEntries().some(
            (entry) =>
              entry.startTime >= pendingNavigation.resourceStartedAt &&
              entry.name.startsWith(window.location.origin) &&
              normalizePath(new URL(entry.name).pathname) !== REPORT_ENDPOINT
          );

          if (hasRelevantResource) {
            scheduleNavigationCheck();
          }
        });
        resourceObserver.observe({ type: "resource", buffered: false });
      } catch {}
    }

    scheduleNavigationCheckRef.current = () => scheduleNavigationCheck();
    document.addEventListener("click", handleClick, { capture: true });

    return () => {
      if (settleTimeoutId !== null) {
        window.clearTimeout(settleTimeoutId);
      }
      scheduleNavigationCheckRef.current = () => {};
      document.removeEventListener("click", handleClick, { capture: true });
      mutationObserver.disconnect();
      resourceObserver?.disconnect();
    };
  }, []);

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      scheduleNavigationCheckRef.current();
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [pathname]);

  return null;
}
