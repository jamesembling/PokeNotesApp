import { Suspense } from "react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { StatCard } from "@/components/ui/StatCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn/tabs";
import { getBattleLogOpponentDisplayName } from "@/lib/battle-log/display";
import { getArchetypeMatchupStats, getLogStatsOverview } from "@/lib/db/logs";
import { measureServerCall } from "@/lib/server/perf";

function formatMetric(value: number) {
  return value.toLocaleString();
}

function formatRecord(wins: number, losses: number) {
  return `${formatMetric(wins)}-${formatMetric(losses)}`;
}

function formatWinRate(value: number | null) {
  return value === null ? "-" : `${value}%`;
}

export default async function StatsPage() {
  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Stats" }]}
        title="Stats"
      />

      <Tabs className="mt-5" defaultValue="overview">
        <TabsList aria-label="Stats sections">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="matchups">Matchups</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card className="grid gap-5">
            <div className="space-y-2">
              <p className="ui-eyebrow">Overview</p>
              <h2 className="ui-section-title">Battle Log Totals</h2>
            </div>

            <Suspense fallback={<StatsOverviewFallback />}>
              <StatsOverviewGrid />
            </Suspense>
          </Card>
        </TabsContent>

        <TabsContent value="matchups">
          <Card className="grid gap-4">
            <div className="space-y-2">
              <p className="ui-eyebrow">Matchups</p>
              <h2 className="ui-section-title">Win % vs Archetypes</h2>
            </div>

            <Suspense fallback={<ArchetypeMatchupsFallback />}>
              <ArchetypeMatchupsTable />
            </Suspense>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

async function StatsOverviewGrid() {
  const overview = await measureServerCall("page.stats.overview", async () =>
    await getLogStatsOverview()
  );
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

async function ArchetypeMatchupsTable() {
  const matchups = await measureServerCall("page.stats.archetypeMatchups", async () =>
    await getArchetypeMatchupStats()
  );

  if (matchups.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border)] px-4 py-6 text-sm text-[var(--text-muted)]">
        No matchup stats yet. Import battle logs with identified opponent archetypes to build this table.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            <th className="py-2 pr-3">Archetype</th>
            <th className="px-3 py-2 text-right">Record</th>
            <th className="px-3 py-2 text-right">Win Rate</th>
            <th className="py-2 pl-3 text-right">Games</th>
          </tr>
        </thead>
        <tbody>
          {matchups.map((matchup) => {
            const displayName = getBattleLogOpponentDisplayName(
              matchup.opponentDeckName,
              matchup.opponentDeckSprites
            );

            return (
              <tr
                className="border-b border-[var(--border)] last:border-b-0"
                key={matchup.matchupKey}
              >
                <td className="py-2.5 pr-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <SpriteStrip
                      className="shrink-0"
                      maxVisible={2}
                      size="xs"
                      sprites={matchup.opponentDeckSprites}
                    />
                    <span className="truncate font-medium text-[var(--text-primary)]">
                      {displayName || matchup.matchupKey}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-[var(--text-primary)]">
                  {formatRecord(matchup.gamesWon, matchup.gamesLost)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono font-semibold text-[var(--text-primary)]">
                  {formatWinRate(matchup.winRate)}
                </td>
                <td className="py-2.5 pl-3 text-right font-mono text-[var(--text-muted)]">
                  {formatMetric(matchup.gamesPlayed)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ArchetypeMatchupsFallback() {
  return (
    <div className="grid gap-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          className="h-10 animate-pulse rounded-lg bg-[var(--bg-surface-alt)]"
          key={index}
        />
      ))}
    </div>
  );
}
