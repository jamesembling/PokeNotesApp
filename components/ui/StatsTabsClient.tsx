"use client";

import { useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Card } from "@/components/shadcn/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn/tabs";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { StatCard } from "@/components/ui/StatCard";
import { getBattleLogOpponentDisplayName } from "@/lib/battle-log/display";
import type { ArchetypeMatchupStats, LogStatsOverview } from "@/lib/db/logs";

type StatsTabsClientProps = {
  overview: LogStatsOverview;
};

type MatchupsResponse = {
  error?: string;
  matchups?: ArchetypeMatchupStats[];
};

function formatMetric(value: number) {
  return value.toLocaleString();
}

function formatRecord(wins: number, losses: number) {
  return `${formatMetric(wins)}-${formatMetric(losses)}`;
}

function formatWinRate(value: number | null) {
  return value === null ? "-" : `${value}%`;
}

function StatsOverviewGrid({ overview }: { overview: LogStatsOverview }) {
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

function ArchetypeMatchupsFallback() {
  return (
    <div className="grid gap-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton className="h-10 rounded-lg" key={index} />
      ))}
    </div>
  );
}

function ArchetypeMatchupsTable({ matchups }: { matchups: ArchetypeMatchupStats[] }) {
  if (matchups.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
        No matchup stats yet. Import battle logs with identified opponent archetypes to build this table.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
              <tr className="border-b border-border last:border-b-0" key={matchup.matchupKey}>
                <td className="py-2.5 pr-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <SpriteStrip
                      className="shrink-0"
                      maxVisible={2}
                      size="xs"
                      sprites={matchup.opponentDeckSprites}
                    />
                    <span className="truncate font-medium text-card-foreground">
                      {displayName || matchup.matchupKey}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-card-foreground">
                  {formatRecord(matchup.gamesWon, matchup.gamesLost)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono font-semibold text-card-foreground">
                  {formatWinRate(matchup.winRate)}
                </td>
                <td className="py-2.5 pl-3 text-right font-mono text-muted-foreground">
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

export function StatsTabsClient({ overview }: StatsTabsClientProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [matchups, setMatchups] = useState<ArchetypeMatchupStats[] | null>(null);
  const [isLoadingMatchups, setIsLoadingMatchups] = useState(false);
  const [matchupsError, setMatchupsError] = useState("");
  const shouldLoadMatchups = activeTab === "matchups" && !matchups && !isLoadingMatchups;

  useEffect(() => {
    if (!shouldLoadMatchups) {
      return;
    }

    let cancelled = false;
    async function loadMatchups() {
      setIsLoadingMatchups(true);
      setMatchupsError("");

      try {
        const response = await fetch("/api/stats-matchups", {
          cache: "no-store",
          credentials: "same-origin"
        });
        const payload = (await response.json().catch(() => ({}))) as MatchupsResponse;

        if (!response.ok || !Array.isArray(payload.matchups)) {
          throw new Error(payload.error || "Could not load matchup stats.");
        }

        if (!cancelled) {
          setMatchups(payload.matchups);
        }
      } catch (error) {
        if (!cancelled) {
          setMatchupsError(error instanceof Error ? error.message : "Could not load matchup stats.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingMatchups(false);
        }
      }
    }

    void loadMatchups();

    return () => {
      cancelled = true;
    };
  }, [shouldLoadMatchups]);

  const matchupContent = useMemo(() => {
    if (matchupsError) {
      return (
        <div className="rounded-lg border border-[var(--color-loss-border)] bg-[var(--color-loss-bg)] px-4 py-6 text-sm text-[var(--color-loss)]">
          {matchupsError}
        </div>
      );
    }

    if (isLoadingMatchups || !matchups) {
      return <ArchetypeMatchupsFallback />;
    }

    return <ArchetypeMatchupsTable matchups={matchups} />;
  }, [isLoadingMatchups, matchups, matchupsError]);

  return (
    <Tabs className="mt-5" defaultValue="overview" onValueChange={setActiveTab} value={activeTab}>
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

          <StatsOverviewGrid overview={overview} />
        </Card>
      </TabsContent>

      <TabsContent value="matchups">
        <Card className="grid gap-4">
          <div className="space-y-2">
            <p className="ui-eyebrow">Matchups</p>
            <h2 className="ui-section-title">Win % vs Archetypes</h2>
          </div>

          {matchupContent}
        </Card>
      </TabsContent>
    </Tabs>
  );
}
