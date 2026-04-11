import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { requireUser } from "@/lib/auth";
import { getLogStatsOverview } from "@/lib/db/logs";

function formatMetric(value: number) {
  return value.toLocaleString();
}

export default async function StatsPage() {
  const user = await requireUser();
  const overview = await getLogStatsOverview(user.id);
  const resolvedGames = overview.gamesWon + overview.gamesLost;
  const winRate = resolvedGames ? Math.round((overview.gamesWon / resolvedGames) * 100) : null;
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
    <>
      <PageHeader
        breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Stats" }]}
        title="Stats"
        subtitle="A quick overview of the results and tracked game metrics pulled from your saved battle logs."
      />

      <Card className="grid gap-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="ui-eyebrow">Overview</p>
            <h2 className="ui-section-title">Battle Log Totals</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full bg-[var(--bg-surface-alt)] px-4 py-1.5 text-sm font-semibold text-[var(--text-muted)]">
              {formatMetric(overview.gamesPlayed)} logs tracked
            </span>
            <span className="inline-flex items-center rounded-full bg-[var(--bg-surface-alt)] px-4 py-1.5 text-sm font-semibold text-[var(--text-muted)]">
              {winRate === null ? "Win rate unavailable" : `${winRate}% win rate`}
            </span>
          </div>
        </div>

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
      </Card>
    </>
  );
}
