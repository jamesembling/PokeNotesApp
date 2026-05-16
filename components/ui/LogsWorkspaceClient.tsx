"use client";

import { Card } from "@/components/shadcn/card";
import { LogsManager } from "@/components/ui/LogsManager";
import type { BattleLogSummary } from "@/types/index";

type LogsWindowPayload = {
  hasMore: boolean;
  logs: BattleLogSummary[];
  nextWindowEndDate: string;
  windowEndDate: string;
  windowStartDate: string;
};

type LogsPagePayload = {
  window: LogsWindowPayload;
};

export function LogsWorkspaceClient({ window }: LogsPagePayload) {
  return (
    <Card className="gap-0 p-0">
      <LogsManager
        initialCanLoadMore={window.hasMore}
        initialLogs={window.logs}
        initialNextWindowEndDate={window.nextWindowEndDate}
        initialWindowEndDate={window.windowEndDate}
        initialWindowStartDate={window.windowStartDate}
      />
    </Card>
  );
}
