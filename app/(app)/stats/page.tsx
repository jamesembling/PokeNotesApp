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
      value: formatMetric(overview.gamesPlayed),
      detail: "All saved battle logs."
    },
    {
      label: "Games Won",
      value: formatMetric(overview.gamesWon),
      detail:
        winRate === null
          ? "Win rate appears once results are recorded."
          : `${winRate}% win rate across resolved games.`,
      valueColor: "win" as const
    },
    {
      label: "Games Lost",
      value: formatMetric(overview.gamesLost),
      detail: resolvedGames
        ? `${formatMetric(resolvedGames)} games have a recorded result.`
        : "No resolved game results yet.",
      valueColor: "loss" as const
    },
    {
      label: "Attack Damage",
      value: formatMetric(overview.attackDamage),
      detail: "Total damage dealt by your side across tracked logs."
    },
    {
      label: "Opponent Attack Damage",
      value: formatMetric(overview.opponentAttackDamage),
      detail: "Total damage dealt by the opposing side."
    },
    {
      label: "Coin Flips Won",
      value: formatMetric(overview.coinFlipsWon),
      detail: "Logs where your side won the opening flip."
    },
    {
      label: "Mulligans Taken",
      value: formatMetric(overview.mulligansTaken),
      detail: "Total mulligans taken by your side."
    },
    {
      label: "Prizes Taken",
      value: formatMetric(overview.prizesTaken),
      detail: "Prize cards taken by your side across tracked logs."
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
              detail={metric.detail}
              key={metric.label}
              label={metric.label}
              value={metric.value}
              valueColor={metric.valueColor}
            />
          ))}
        </div>
      </Card>

      <Card className="grid gap-4 bg-[var(--bg-surface-alt)]">
        <div className="space-y-2">
          <p className="ui-eyebrow">How Totals Work</p>
          <h2 className="ui-section-title">Calculated from saved logs</h2>
        </div>
        <div className="grid gap-3 text-sm leading-7 text-[var(--text-muted)] lg:grid-cols-3">
          <p>
            Stats are derived from the same parsed battle-log data used in the Battle Log detail
            view, so this page stays read-only and updates automatically when logs change.
          </p>
          <p>
            Damage, prizes, mulligans, and coin flips only count when they can be identified from
            the saved log data and your matched player side.
          </p>
          <p>
            Tracked total damage across both players is {formatMetric(overview.trackedDamage)}, and
            tracked total prizes across both players is {formatMetric(overview.trackedPrizes)}.
          </p>
        </div>
      </Card>
    </>
  );
}
