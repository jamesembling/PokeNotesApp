import { PageHeader } from "@/components/ui/PageHeader";
import { StatsTabsClient } from "@/components/ui/StatsTabsClient";
import { requireUser } from "@/lib/auth";
import { getArchetypeMatchupStats, getLogStatsOverview } from "@/lib/db/logs";
import { measureServerCall } from "@/lib/server/perf";

export default async function StatsPage() {
  const user = await requireUser();
  const [overview, matchups] = await measureServerCall("page.stats.data", async () =>
    await Promise.all([
      getLogStatsOverview(user.id),
      getArchetypeMatchupStats(user.id)
    ])
  );

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Stats" }]}
        title="Stats"
      />

      <StatsTabsClient matchups={matchups} overview={overview} />
    </>
  );
}
