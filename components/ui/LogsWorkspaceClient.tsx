"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import type { LogsManagerProps } from "@/components/ui/LogsManager";
import type { BattleLogSummary } from "@/types/index";

type LogSummaryStats = {
  losses: number;
  total: number;
  wins: number;
};

type LogsWindowPayload = {
  hasMore: boolean;
  logs: BattleLogSummary[];
  nextWindowEndDate: string;
  windowEndDate: string;
  windowStartDate: string;
};

type LogsPagePayload = {
  stats: LogSummaryStats;
  window: LogsWindowPayload;
};

const LogsManager = dynamic<LogsManagerProps>(
  () => import("@/components/ui/LogsManager").then((module) => module.LogsManager),
  {
    loading: () => <LogsManagerFallback />,
    ssr: false
  }
);

function LogsSummarySkeleton() {
  return (
    <Card>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            className="h-24 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)]"
            key={index}
          />
        ))}
      </div>
    </Card>
  );
}

function LogsManagerFallback() {
  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="h-5 w-32 animate-pulse rounded bg-[var(--bg-surface-alt)]" />
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            className="h-20 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)]"
            key={index}
          />
        ))}
      </div>
    </Card>
  );
}

export function LogsWorkspaceClient() {
  const [pageData, setPageData] = useState<LogsPagePayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadLogsWindow() {
      try {
        const response = await fetch("/api/logs-page-data", {
          credentials: "same-origin",
          cache: "no-store"
        });

        if (!response.ok) {
          throw new Error("Could not load logs.");
        }

        const payload = (await response.json()) as LogsPagePayload;

        if (active) {
          setPageData(payload);
        }
      } catch (loadError) {
        console.error(loadError);
        if (active) {
          setError("Could not load battle logs right now.");
        }
      }
    }

    loadLogsWindow();

    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <>
        <LogsSummarySkeleton />
        <Card>
          <p className="text-sm text-[var(--color-loss)]">{error}</p>
        </Card>
      </>
    );
  }

  if (!pageData) {
    return (
      <>
        <LogsSummarySkeleton />
        <LogsManagerFallback />
      </>
    );
  }

  const page = pageData.window;

  return (
    <>
      <Card>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Total Logs" value={pageData.stats.total} />
          <StatCard label="Wins" value={pageData.stats.wins} valueColor="win" />
          <StatCard label="Losses" value={pageData.stats.losses} valueColor="loss" />
        </div>
      </Card>

      <Card>
        <LogsManager
          initialCanLoadMore={page.hasMore}
          initialLogs={page.logs}
          initialNextWindowEndDate={page.nextWindowEndDate}
          initialWindowEndDate={page.windowEndDate}
          initialWindowStartDate={page.windowStartDate}
        />
      </Card>
    </>
  );
}
