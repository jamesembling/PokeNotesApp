"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type ClientPerfPanelProps = {
  expandedGroupCount: number;
  totalGroupCount: number;
  visibleLogCount: number;
};

type PerfSnapshot = {
  enabled: boolean;
  hardwareConcurrency: number | null;
  deviceMemory: number | null;
  lastLongTaskDuration: number | null;
  lastLongTaskStartedAt: number | null;
  lcp: number | null;
  navigationType: string | null;
  totalBlockingTimeEstimate: number;
};

type NavigatorWithDeviceMemory = Navigator & {
  deviceMemory?: number;
};

function formatMetric(value: number | null, suffix = "ms") {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }

  return `${value.toFixed(1)}${suffix}`;
}

export function ClientPerfPanel({
  expandedGroupCount,
  totalGroupCount,
  visibleLogCount
}: ClientPerfPanelProps) {
  const searchParams = useSearchParams();
  const renderCountRef = useRef(0);
  const [snapshot, setSnapshot] = useState<PerfSnapshot>({
    enabled: false,
    hardwareConcurrency: null,
    deviceMemory: null,
    lastLongTaskDuration: null,
    lastLongTaskStartedAt: null,
    lcp: null,
    navigationType: null,
    totalBlockingTimeEstimate: 0
  });

  renderCountRef.current += 1;

  const perfEnabled = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }

    if (searchParams.get("perf") === "1") return true;
    try {
      return window.localStorage.getItem("poke-notes:perf") === "1";
    } catch {
      return false;
    }
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      if (searchParams.get("perf") === "1") {
        window.localStorage.setItem("poke-notes:perf", "1");
        return;
      }

      if (searchParams.get("perf") === "0") {
        window.localStorage.removeItem("poke-notes:perf");
      }
    } catch {
      // A diagnostic preference must not block the workspace when storage is denied.
    }
  }, [searchParams]);

  useEffect(() => {
    if (!perfEnabled || typeof window === "undefined") {
      setSnapshot((current) => ({
        ...current,
        enabled: perfEnabled
      }));
      return;
    }

    const nav = (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined) ?? null;
    const typedNavigator = navigator as NavigatorWithDeviceMemory;

    setSnapshot((current) => ({
      ...current,
      enabled: true,
      hardwareConcurrency: navigator.hardwareConcurrency ?? null,
      deviceMemory:
        typeof typedNavigator.deviceMemory === "number" ? typedNavigator.deviceMemory : null,
      navigationType: nav?.type ?? null
    }));

    let lcpObserver: PerformanceObserver | null = null;
    let longTaskObserver: PerformanceObserver | null = null;

    if (typeof PerformanceObserver !== "undefined") {
      try {
        lcpObserver = new PerformanceObserver((entryList) => {
          const entries = entryList.getEntries();
          const lastEntry = entries.at(-1);

          if (!lastEntry) {
            return;
          }

          setSnapshot((current) => ({
            ...current,
            lcp: lastEntry.startTime
          }));
        });
        lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
      } catch {}

      try {
        longTaskObserver = new PerformanceObserver((entryList) => {
          const entries = entryList.getEntries();
          const lastEntry = entries.at(-1);

          if (!lastEntry) {
            return;
          }

          setSnapshot((current) => ({
            ...current,
            lastLongTaskDuration: lastEntry.duration,
            lastLongTaskStartedAt: lastEntry.startTime,
            totalBlockingTimeEstimate:
              current.totalBlockingTimeEstimate + Math.max(0, lastEntry.duration - 50)
          }));
        });
        longTaskObserver.observe({ type: "longtask", buffered: true });
      } catch {}
    }

    return () => {
      lcpObserver?.disconnect();
      longTaskObserver?.disconnect();
    };
  }, [perfEnabled]);

  if (!snapshot.enabled) {
    return null;
  }

  return (
    <section className="rounded-[20px] border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="ui-eyebrow">Perf Debug</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Enabled by <code>?perf=1</code>. Remove with <code>?perf=0</code>.
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>Nav: {snapshot.navigationType ?? "n/a"}</p>
          <p>Renders: {renderCountRef.current}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[16px] border border-border bg-muted p-3">
          <p className="ui-eyebrow">LCP</p>
          <p className="mt-2 font-display text-[1.2rem] font-semibold text-card-foreground">
            {formatMetric(snapshot.lcp)}
          </p>
        </div>
        <div className="rounded-[16px] border border-border bg-muted p-3">
          <p className="ui-eyebrow">Last Long Task</p>
          <p className="mt-2 font-display text-[1.2rem] font-semibold text-card-foreground">
            {formatMetric(snapshot.lastLongTaskDuration)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Started at {formatMetric(snapshot.lastLongTaskStartedAt)}
          </p>
        </div>
        <div className="rounded-[16px] border border-border bg-muted p-3">
          <p className="ui-eyebrow">Blocking Estimate</p>
          <p className="mt-2 font-display text-[1.2rem] font-semibold text-card-foreground">
            {formatMetric(snapshot.totalBlockingTimeEstimate)}
          </p>
        </div>
        <div className="rounded-[16px] border border-border bg-muted p-3">
          <p className="ui-eyebrow">Device</p>
          <p className="mt-2 font-display text-[1.2rem] font-semibold text-card-foreground">
            {snapshot.hardwareConcurrency ?? "n/a"} cores
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Memory: {snapshot.deviceMemory ?? "n/a"} GB
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[16px] border border-border bg-muted p-3">
          <p className="ui-eyebrow">Visible Logs</p>
          <p className="mt-2 font-display text-[1.2rem] font-semibold text-card-foreground">
            {visibleLogCount}
          </p>
        </div>
        <div className="rounded-[16px] border border-border bg-muted p-3">
          <p className="ui-eyebrow">Expanded Groups</p>
          <p className="mt-2 font-display text-[1.2rem] font-semibold text-card-foreground">
            {expandedGroupCount}/{totalGroupCount}
          </p>
        </div>
        <div className="rounded-[16px] border border-border bg-muted p-3">
          <p className="ui-eyebrow">Interpretation</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            High LCP suggests slow first paint. Large long tasks suggest main-thread jank during
            scrolling or interaction.
          </p>
        </div>
      </div>
    </section>
  );
}
