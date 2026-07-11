"use client";

import { LogsManager } from "@/components/ui/LogsManager";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageActions } from "@/components/ui/PageActions";
import type { BattleLogSummary } from "@/types/index";

type LogsWindowPayload = {
  hasMore: boolean;
  logs: BattleLogSummary[];
  nextWindowEndDate: string;
  windowEndDate: string;
  windowStartDate: string;
};

type LogsPagePayload = {
  stats: {
    losses: number;
    total: number;
    wins: number;
  };
  window: LogsWindowPayload;
};

export function LogsWorkspaceClient({ stats, window }: LogsPagePayload) {
  return (
    <>
      <LogsManager
        initialCanLoadMore={window.hasMore}
        initialLogs={window.logs}
        initialNextWindowEndDate={window.nextWindowEndDate}
        initialWindowEndDate={window.windowEndDate}
        initialWindowStartDate={window.windowStartDate}
        renderHeaderAction={(action) => (
          <PageHeader
            action={<PageActions className="hidden sm:flex">{action}</PageActions>}
            breadcrumb={[
              { label: "Poke Notes", href: "/" },
              { label: "Battle Logs" }
            ]}
            meta={
              <div
                aria-label={`${stats.total} total battle logs, ${stats.wins} wins, ${stats.losses} losses`}
                className="flex flex-wrap items-center gap-y-2 text-sm text-muted-foreground"
              >
                <div className="flex items-baseline gap-2 pr-5">
                  <span className="text-[1.35rem] font-semibold leading-none text-card-foreground [font-variant-numeric:tabular-nums]">
                    {stats.total}
                  </span>
                  <span>total</span>
                </div>
                <div aria-hidden="true" className="h-5 w-px bg-border" />
                <div className="flex items-baseline gap-2 px-5">
                  <span className="text-[1.35rem] font-semibold leading-none text-win-strong [font-variant-numeric:tabular-nums]">
                    {stats.wins}
                  </span>
                  <span>wins</span>
                </div>
                <div aria-hidden="true" className="h-5 w-px bg-border" />
                <div className="flex items-baseline gap-2 pl-5">
                  <span className="text-[1.35rem] font-semibold leading-none text-loss-strong [font-variant-numeric:tabular-nums]">
                    {stats.losses}
                  </span>
                  <span>losses</span>
                </div>
              </div>
            }
            title="Battle Logs"
          />
        )}
      />
    </>
  );
}
