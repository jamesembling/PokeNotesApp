import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardOverview } from "@/components/ui/dashboard/DashboardOverview";
import {
  DashboardActivityLoading,
  DashboardPointTotalsLoading,
  DashboardStatsLoading,
  DashboardTournamentsLoading
} from "@/components/ui/dashboard/DashboardLoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProxyAuthTimingMarker } from "@/components/ui/RouteTimingMarker";
import { requireUser } from "@/lib/auth";
import { getLogDamageTimeline, getLogsWindow, getLogStatsOverview } from "@/lib/db/logs";
import { getTournamentSummaries } from "@/lib/db/tournaments";
import { measureServerCall } from "@/lib/server/perf";
import styles from "@/components/ui/dashboard/dashboard.module.css";

export const metadata: Metadata = {
  title: "Dashboard | Poke Notes"
};

export default async function DashboardPage() {
  const user = await requireUser();
  const statsPromise = Promise.all([
    measureServerCall("page.dashboard.statsOverview", () => getLogStatsOverview(user.id)),
    measureServerCall("page.dashboard.recentPerformance", () => getLogDamageTimeline(user.id, 10))
  ]);
  const logsPromise = measureServerCall("page.dashboard.latestLogs", () =>
    getLogsWindow(user.id, { limit: 4 })
  );
  const tournamentsPromise = measureServerCall("page.dashboard.latestTournaments", () =>
    getTournamentSummaries(user.id)
  );

  return (
    <div className={styles.page}>
      <ProxyAuthTimingMarker />
      <PageHeader
        action={
          <Suspense fallback={<DashboardPointTotalsLoading />}>
            <DashboardOverview.PointTotals dataPromise={tournamentsPromise} />
          </Suspense>
        }
        breadcrumb={[{ label: "Poke Notes" }]}
        title="Dashboard"
      />

      <DashboardOverview
        stats={
          <Suspense fallback={<DashboardStatsLoading />}>
            <DashboardOverview.Stats dataPromise={statsPromise} />
          </Suspense>
        }
        battleLogs={
          <Suspense fallback={<DashboardActivityLoading />}>
            <DashboardOverview.BattleLogs dataPromise={logsPromise} />
          </Suspense>
        }
        tournaments={
          <Suspense fallback={<DashboardTournamentsLoading />}>
            <DashboardOverview.Tournaments dataPromise={tournamentsPromise} />
          </Suspense>
        }
      />
    </div>
  );
}
