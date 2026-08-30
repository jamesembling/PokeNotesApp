import { Suspense } from "react";
import { Skeleton } from "@/components/shadcn/skeleton";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatsTabsClient } from "@/components/ui/StatsTabsClient";
import { requireUser } from "@/lib/auth";
import { getLogDamageTimeline, getLogStatsOverview } from "@/lib/db/logs";
import { measureServerCall } from "@/lib/server/perf";
import styles from "@/components/ui/stats/stats.module.css";

export default async function StatsPage() {
  const user = await requireUser();
  const overviewPromise = measureServerCall("page.stats.overview", () => getLogStatsOverview(user.id));
  // Fifty visible form points plus nineteen games to warm the first rolling window.
  const damageTimelinePromise = measureServerCall("page.stats.damageTimeline", () => getLogDamageTimeline(user.id, 69));

  return (
    <>
      <PageHeader breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Stats" }]} title="Stats" />
      <Suspense fallback={<StatsOverviewFallback />}>
        <StatsContent overviewPromise={overviewPromise} damageTimelinePromise={damageTimelinePromise} />
      </Suspense>
    </>
  );
}

async function StatsContent({ damageTimelinePromise, overviewPromise }: {
  damageTimelinePromise: ReturnType<typeof getLogDamageTimeline>;
  overviewPromise: ReturnType<typeof getLogStatsOverview>;
}) {
  const [overview, damageTimeline] = await Promise.all([overviewPromise, damageTimelinePromise]);
  return <StatsTabsClient overview={overview} damageTimeline={damageTimeline} />;
}

function StatsOverviewFallback() {
  return (
    <div aria-label="Loading stats" className={styles.root} role="status">
      <div className={styles.navigation}><Skeleton className="my-3 h-5 w-44 rounded-none" /></div>
      <div className={styles.performance}>
        <div className="space-y-6 py-1"><Skeleton className="h-5 w-24 rounded-none" /><Skeleton className="h-24 w-40 rounded-none" /><Skeleton className="h-16 w-full rounded-none" /></div>
        <Skeleton className={`${styles.skeletonChart} rounded-none`} />
        <div className={styles.recentStrip}><Skeleton className="h-6 w-2/3 rounded-none" /></div>
      </div>
      <div className={styles.detailsHeading}><Skeleton className="h-8 w-52 rounded-none" /></div>
      <div className={styles.details}>{[0, 1, 2].map((index) => <Skeleton className="h-44 rounded-none" key={index} />)}</div>
    </div>
  );
}
