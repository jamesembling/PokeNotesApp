"use client";

import { useEffect } from "react";
import { LogsManager } from "@/components/ui/LogsManager";
import { writeLastKnownLogsSnapshot } from "@/lib/client/logs-last-known";
import type { BattleLogSummary } from "@/types/index";

type LogsWindowPayload = {
  hasMore: boolean;
  logs: BattleLogSummary[];
  nextWindowEndDate: string;
  windowEndDate: string;
  windowStartDate: string;
};

type LogsWorkspaceClientProps = {
  stats: {
    losses: number;
    total: number;
    wins: number;
  };
  window: LogsWindowPayload;
};

export function LogsWorkspaceClient({ stats, window }: LogsWorkspaceClientProps) {
  useEffect(() => {
    writeLastKnownLogsSnapshot({ logs: window.logs, stats });
  }, [stats, window.logs]);

  return (
    <LogsManager
      initialCanLoadMore={window.hasMore}
      initialLogs={window.logs}
      initialNextWindowEndDate={window.nextWindowEndDate}
      initialWindowEndDate={window.windowEndDate}
      initialWindowStartDate={window.windowStartDate}
    />
  );
}
