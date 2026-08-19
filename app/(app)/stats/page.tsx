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
    <div className="-mt-2 grid gap-6 sm:mt-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-11 w-24 rounded-lg" />
        <Skeleton className="h-4 w-24 rounded" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(260px,0.72fr)_minmax(0,1.5fr)] xl:items-start">
        <div className="overflow-hidden rounded-lg border border-border bg-card xl:col-start-1 xl:row-start-1">
          <div className="space-y-5 p-5">
            <Skeleton className="h-6 w-20 rounded" />
            <div className="space-y-2">
              <Skeleton className="h-3 w-16 rounded" />
              <Skeleton className="h-10 w-24 rounded" />
            </div>
          </div>
          <div className="grid grid-cols-2 border-t border-border">
            <Skeleton className="h-24 rounded-none" />
            <Skeleton className="h-24 rounded-none border-l border-border" />
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card xl:col-start-2 xl:row-span-2 xl:row-start-1">
          <div className="p-5">
            <Skeleton className="h-6 w-36 rounded" />
          </div>
          <div className="grid grid-cols-2 border-t border-border sm:grid-cols-3">
            <Skeleton className="h-24 rounded-none" />
            <Skeleton className="h-24 rounded-none border-l border-border" />
            <Skeleton className="col-span-2 h-24 rounded-none border-t border-border sm:col-span-1 sm:border-l sm:border-t-0" />
          </div>
          <Skeleton className="h-80 rounded-none border-t border-border sm:h-96" />
        </div>

        <div className="space-y-4 rounded-lg border border-border bg-card p-5 xl:col-start-1 xl:row-start-2">
          <Skeleton className="h-6 w-28 rounded" />
          <Skeleton className="h-44 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
