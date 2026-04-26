"use client";

import { Card } from "@/components/ui/Card";
import { LogsManager } from "@/components/ui/LogsManager";
import { StatCard } from "@/components/ui/StatCard";
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

export function LogsWorkspaceClient({ stats, window }: LogsPagePayload) {
  return (
    <>
      <Card>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Total Logs" value={stats.total} />
          <StatCard label="Wins" value={stats.wins} valueColor="win" />
          <StatCard label="Losses" value={stats.losses} valueColor="loss" />
        </div>
      </Card>

      <Card>
        <LogsManager
          initialCanLoadMore={window.hasMore}
          initialLogs={window.logs}
          initialNextWindowEndDate={window.nextWindowEndDate}
          initialWindowEndDate={window.windowEndDate}
          initialWindowStartDate={window.windowStartDate}
        />
      </Card>
    </>
  );
}
