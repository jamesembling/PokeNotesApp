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
  matchups?: ArchetypeMatchupStats[];
  overview: LogStatsOverview;
};

type MatchupsResponse = {
  error?: string;
  matchups?: ArchetypeMatchupStats[];
};

const MIN_MATCHUP_GAMES = 3;

function formatMetric(value: number) {
  return value.toLocaleString();
}

function formatRecord(wins: number, losses: number) {
  return `${formatMetric(wins)}-${formatMetric(losses)}`;
}

function formatWinRate(value: number | null) {
  return value === null ? "-" : `${value}%`;
}

function getWinRateBarWidth(value: number | null) {
  if (value === null) {
    return "0%";
  }

  return `${Math.min(Math.max(value, 0), 100)}%`;
}

function getWinRateTone(value: number | null) {
  if (value === null) {
    return {
      barClassName: "bg-muted-foreground",
      textClassName: "text-muted-foreground"
    };
  }

  if (value >= 75) {
    return {
      barClassName: "bg-[var(--color-win)]",
      textClassName: "text-[var(--color-win-strong)]"
    };
  }

  if (value >= 50) {
    return {
      barClassName: "bg-[var(--color-warning)]",
      textClassName: "text-[var(--color-warning-strong)]"
    };
  }

  return {
    barClassName: "bg-[var(--color-loss)]",
    textClassName: "text-[var(--color-loss-strong)]"
  };
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

function MatchupIdentity({
  matchup,
  spriteSize = "xs"
}: {
  matchup: ArchetypeMatchupStats;
  spriteSize?: "xs" | "sm";
}) {
  const displayName = getBattleLogOpponentDisplayName(
    matchup.opponentDeckName,
    matchup.opponentDeckSprites
  );

  return (
    <div className="flex min-w-0 items-center gap-2">
      <SpriteStrip
        className="shrink-0"
        maxVisible={2}
        size={spriteSize}
        sprites={matchup.opponentDeckSprites}
      />
      <span className="min-w-0 truncate font-medium text-card-foreground">
        {displayName || matchup.matchupKey}
      </span>
    </div>
  );
}

function compareMatchupsByWinRate(
  left: ArchetypeMatchupStats,
  right: ArchetypeMatchupStats
) {
  const leftWinRate = left.winRate ?? -1;
  const rightWinRate = right.winRate ?? -1;

  if (leftWinRate !== rightWinRate) {
    return rightWinRate - leftWinRate;
  }

  if (left.gamesPlayed !== right.gamesPlayed) {
    return right.gamesPlayed - left.gamesPlayed;
  }

  return left.matchupKey.localeCompare(right.matchupKey);
}

function ArchetypeMatchupsTable({ matchups }: { matchups: ArchetypeMatchupStats[] }) {
  const visibleMatchups = matchups
    .filter((matchup) => matchup.gamesPlayed >= MIN_MATCHUP_GAMES)
    .toSorted(compareMatchupsByWinRate);

  if (visibleMatchups.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
        No matchup stats with at least {MIN_MATCHUP_GAMES} games yet. Import more battle logs with
        identified opponent archetypes to build this table.
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-2 sm:hidden">
        {visibleMatchups.map((matchup) => {
          const tone = getWinRateTone(matchup.winRate);

          return (
            <div className="border-b border-border py-3 last:border-b-0" key={matchup.matchupKey}>
              <div className="flex items-start justify-between gap-3">
                <MatchupIdentity matchup={matchup} />
                <span className={`shrink-0 font-mono text-sm font-semibold ${tone.textClassName}`}>
                  {formatWinRate(matchup.winRate)}
                </span>
              </div>

              <div className="mt-3 h-1 rounded-full bg-border">
                <div
                  className={`h-full rounded-full ${tone.barClassName}`}
                  style={{ width: getWinRateBarWidth(matchup.winRate) }}
                />
              </div>

              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-muted-foreground">
                <span>
                  <span className="font-mono text-card-foreground">
                    {formatRecord(matchup.gamesWon, matchup.gamesLost)}
                  </span>{" "}
                  record
                </span>
                <span>
                  <span className="font-mono text-card-foreground">
                    {formatMetric(matchup.gamesPlayed)}
                  </span>{" "}
                  games
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden sm:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3">Archetype</th>
              <th className="px-3 py-2 text-right">Games</th>
              <th className="px-3 py-2 text-right">Record</th>
              <th className="py-2 pl-3 text-right">Win Rate</th>
            </tr>
          </thead>
          <tbody>
            {visibleMatchups.map((matchup) => {
              const tone = getWinRateTone(matchup.winRate);

              return (
                <tr className="border-b border-border last:border-b-0" key={matchup.matchupKey}>
                  <td className="py-2.5 pr-3">
                    <MatchupIdentity matchup={matchup} spriteSize="sm" />
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                    {formatMetric(matchup.gamesPlayed)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-card-foreground">
                    {formatRecord(matchup.gamesWon, matchup.gamesLost)}
                  </td>
                  <td className={`py-2.5 pl-3 text-right font-mono font-semibold ${tone.textClassName}`}>
                    {formatWinRate(matchup.winRate)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function StatsTabsClient({ matchups: initialMatchups, overview }: StatsTabsClientProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [matchups, setMatchups] = useState<ArchetypeMatchupStats[] | null>(
    initialMatchups ?? null
  );
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
    <Tabs className="-mt-2 sm:mt-5" defaultValue="overview" onValueChange={setActiveTab} value={activeTab}>
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
