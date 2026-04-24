"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { LogsManager } from "@/components/ui/LogsManager";
import type { BattleLogSummary } from "@/types/index";

type LogsWindowPayload = {
  hasMore: boolean;
  logs: BattleLogSummary[];
  nextWindowEndDate: string;
  windowEndDate: string;
  windowStartDate: string;
};

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
  const [page, setPage] = useState<LogsWindowPayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadLogsWindow() {
      try {
        const response = await fetch("/api/logs-window", {
          credentials: "same-origin",
          cache: "no-store"
        });

        if (!response.ok) {
          throw new Error("Could not load logs.");
        }

        const payload = (await response.json()) as LogsWindowPayload;

        if (active) {
          setPage(payload);
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
      <Card>
        <p className="text-sm text-[var(--color-loss)]">{error}</p>
      </Card>
    );
  }

  if (!page) {
    return <LogsManagerFallback />;
  }

  return (
    <Card>
      <LogsManager
        initialCanLoadMore={page.hasMore}
        initialLogs={page.logs}
        initialNextWindowEndDate={page.nextWindowEndDate}
        initialWindowEndDate={page.windowEndDate}
        initialWindowStartDate={page.windowStartDate}
      />
    </Card>
  );
}
