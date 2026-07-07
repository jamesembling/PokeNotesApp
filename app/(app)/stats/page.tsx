import { Suspense } from "react";
import { Skeleton } from "@/components/shadcn/skeleton";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatsTabsClient } from "@/components/ui/StatsTabsClient";
import { requireUser } from "@/lib/auth";
import { getLogDamageTimeline, getLogStatsOverview } from "@/lib/db/logs";
import { measureServerCall } from "@/lib/server/perf";

export default async function StatsPage() {
  const user = await requireUser();
  const overviewPromise = measureServerCall("page.stats.overview", () =>
    getLogStatsOverview(user.id)
  );
  const damageTimelinePromise = measureServerCall("page.stats.damageTimeline", () =>
    getLogDamageTimeline(user.id)
  );

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Stats" }]}
        title="Stats"
      />

      <Suspense fallback={<StatsOverviewFallback />}>
        <StatsContent overviewPromise={overviewPromise} damageTimelinePromise={damageTimelinePromise} />
      </Suspense>
    </>
  );
}

async function StatsContent({
  damageTimelinePromise,
  overviewPromise
}: {
  damageTimelinePromise: ReturnType<typeof getLogDamageTimeline>;
  overviewPromise: ReturnType<typeof getLogStatsOverview>;
}) {
  const [overview, damageTimeline] = await Promise.all([overviewPromise, damageTimelinePromise]);

  return <StatsTabsClient overview={overview} damageTimeline={damageTimeline} />;
}

function StatsOverviewFallback() {
  return (
    <div className="-mt-2 grid gap-5 sm:mt-5">
      <div className="flex gap-2">
        <Skeleton className="h-9 w-24 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
      <div className="grid gap-5 rounded-lg border border-border bg-card p-4 sm:p-6">
        <div className="hidden space-y-2 sm:block">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="grid gap-5">
          <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton className="h-24 rounded-lg" key={index} />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="col-span-2 h-24 rounded-lg" />
          </div>
          <Skeleton className="h-32 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
