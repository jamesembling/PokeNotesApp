import { Suspense } from "react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { getLogStatsOverview } from "@/lib/db/logs";

function formatMetric(value: number) {
  return value.toLocaleString();
}

export default async function StatsPage() {
  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Stats" }]}
        title="Stats"
      />

      <Card className="grid gap-5">
        <div className="space-y-2">
          <p className="ui-eyebrow">Overview</p>
          <h2 className="ui-section-title">Battle Log Totals</h2>
        </div>

        <Suspense fallback={<StatsOverviewFallback />}>
          <StatsOverviewGrid />
        </Suspense>
      </Card>
    </>
  );
}

async function StatsOverviewGrid() {
  const overview = await getLogStatsOverview();
  const metrics = [
    {
      label: "Games Played",
      value: formatMetric(overview.gamesPlayed)
    },
    {
      label: "Games Won",
      value: formatMetric(overview.gamesWon),
      valueColor: "win" as const
    },
    {
      label: "Games Lost",
      value: formatMetric(overview.gamesLost),
      valueColor: "loss" as const
    },
    {
      label: "Attack Damage",
      value: formatMetric(overview.attackDamage)
    },
    {
      label: "Opponent Attack Damage",
      value: formatMetric(overview.opponentAttackDamage)
    },
    {
      label: "Coin Flips Won",
      value: formatMetric(overview.coinFlipsWon)
    },
    {
      label: "Mulligans Taken",
      value: formatMetric(overview.mulligansTaken)
    },
    {
      label: "Prizes Taken",
      value: formatMetric(overview.prizesTaken)
    }
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <StatCard
          key={metric.label}
          label={metric.label}
          value={metric.value}
          valueColor={metric.valueColor}
        />
      ))}
    </div>
  );
}

function StatsOverviewFallback() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          className="h-24 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)]"
          key={index}
        />
      ))}
    </div>
  );
}
