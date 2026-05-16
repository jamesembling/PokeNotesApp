"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { CoinsIcon, RotateCcwIcon, TrophyIcon } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Card } from "@/components/shadcn/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn/tabs";
import { ChevronIcon } from "@/components/ui/icons";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
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

type MatchupSortKey = "games" | "record" | "winRate";
type SortDirection = "asc" | "desc";

const MIN_MATCHUP_GAMES = 3;
const DEFAULT_MATCHUP_SORT = {
  direction: "desc" as const,
  key: "winRate" as const
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

function getOverviewWinRate(overview: LogStatsOverview) {
  return overview.gamesPlayed > 0 ? Math.round((overview.gamesWon / overview.gamesPlayed) * 100) : null;
}

function getDamageComparison(overview: LogStatsOverview) {
  const advantage = overview.attackDamage - overview.opponentAttackDamage;
  const absoluteAdvantage = Math.abs(advantage);
  const percentage =
    absoluteAdvantage > 0 && Math.max(overview.attackDamage, overview.opponentAttackDamage) > 0
      ? Math.round((absoluteAdvantage / Math.max(overview.attackDamage, overview.opponentAttackDamage)) * 100)
      : 0;

  if (advantage > 0) {
    return {
      detail: `You dealt ${percentage}% more damage than opponents`,
      label: "Damage Advantage",
      value: `+${formatMetric(advantage)}`,
      valueClassName: "text-win"
    };
  }

  if (advantage < 0) {
    return {
      detail: `Opponents dealt ${percentage}% more damage than you`,
      label: "Damage Deficit",
      value: `-${formatMetric(absoluteAdvantage)}`,
      valueClassName: "text-loss"
    };
  }

  return {
    detail: "You dealt the same damage as opponents",
    label: "Damage Advantage",
    value: formatMetric(0),
    valueClassName: "text-card-foreground"
  };
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
      barClassName: "bg-win",
      textClassName: "text-win"
    };
  }

  if (value >= 50) {
    return {
      barClassName: "bg-warning",
      textClassName: "text-warning"
    };
  }

  return {
    barClassName: "bg-loss",
    textClassName: "text-loss"
  };
}

function OverviewSection({
  children,
  title
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="grid gap-2">
      <div className="flex min-h-7 items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase leading-none tracking-wide text-muted-foreground">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function OverviewTile({
  className = "",
  detail,
  label,
  value,
  valueClassName = "text-card-foreground"
}: {
  className?: string;
  detail?: string;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className={`grid min-h-[70px] content-start gap-2 rounded-lg bg-muted p-4 ${className}`}>
      <p className="text-xs font-semibold uppercase leading-none tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={`text-2xl font-semibold leading-none [font-variant-numeric:tabular-nums] ${valueClassName}`}>
        {value}
      </p>
      {detail ? <p className="text-xs font-medium leading-snug text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function GameStatRow({
  icon,
  label,
  value
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-h-9 items-center gap-2 border-b border-border px-4 py-2.5 last:border-b-0">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-muted-foreground">{label}</span>
      <span className="font-mono text-sm font-semibold text-card-foreground">{value}</span>
    </div>
  );
}

function StatsOverviewGrid({ overview }: { overview: LogStatsOverview }) {
  const damageComparison = getDamageComparison(overview);
  const winRate = getOverviewWinRate(overview);

  return (
    <div className="grid gap-5">
      <OverviewSection title="Results">
        <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
          <OverviewTile label="Games Played" value={formatMetric(overview.gamesPlayed)} />
          <OverviewTile
            label="Win Rate"
            value={formatWinRate(winRate)}
            valueClassName="text-win"
          />
          <OverviewTile
            label="Won"
            value={formatMetric(overview.gamesWon)}
            valueClassName="text-win"
          />
          <OverviewTile
            label="Lost"
            value={formatMetric(overview.gamesLost)}
            valueClassName="text-loss"
          />
        </div>
      </OverviewSection>

      <OverviewSection title="Damage">
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <OverviewTile label="Attack Damage" value={formatMetric(overview.attackDamage)} />
          <OverviewTile label="Opponent Damage" value={formatMetric(overview.opponentAttackDamage)} />
          <OverviewTile
            className="col-span-2"
            detail={damageComparison.detail}
            label={damageComparison.label}
            value={damageComparison.value}
            valueClassName={damageComparison.valueClassName}
          />
        </div>
      </OverviewSection>

      <OverviewSection title="Game Stats">
        <div className="overflow-hidden rounded-lg border border-border bg-muted/60">
          <GameStatRow
            icon={<TrophyIcon className="h-4 w-4" />}
            label="Prizes taken"
            value={formatMetric(overview.prizesTaken)}
          />
          <GameStatRow
            icon={<CoinsIcon className="h-4 w-4" />}
            label="Coin flips won"
            value={formatMetric(overview.coinFlipsWon)}
          />
          <GameStatRow
            icon={<RotateCcwIcon className="h-4 w-4" />}
            label="Mulligans taken"
            value={formatMetric(overview.mulligansTaken)}
          />
        </div>
      </OverviewSection>
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

function getNextMatchupSortDirection(
  key: MatchupSortKey,
  currentSort: { key: MatchupSortKey; direction: SortDirection }
) {
  if (currentSort.key === key) {
    return currentSort.direction === "desc" ? "asc" : "desc";
  }

  return "desc";
}

function compareNumber(left: number, right: number, direction: SortDirection) {
  return direction === "asc" ? left - right : right - left;
}

function compareMatchupsBySort(
  sort: { key: MatchupSortKey; direction: SortDirection },
  left: ArchetypeMatchupStats,
  right: ArchetypeMatchupStats
) {
  let result = 0;

  switch (sort.key) {
    case "games":
      result = compareNumber(left.gamesPlayed, right.gamesPlayed, sort.direction);
      break;
    case "record":
      result = compareNumber(left.gamesWon, right.gamesWon, sort.direction);
      if (result === 0) {
        result =
          sort.direction === "asc"
            ? compareNumber(left.gamesLost, right.gamesLost, "desc")
            : compareNumber(left.gamesLost, right.gamesLost, "asc");
      }
      break;
    case "winRate":
      result = compareNumber(left.winRate ?? -1, right.winRate ?? -1, sort.direction);
      break;
  }

  if (result !== 0) {
    return result;
  }

  if (sort.key !== "winRate" && left.winRate !== right.winRate) {
    return compareNumber(left.winRate ?? -1, right.winRate ?? -1, "desc");
  }

  if (sort.key !== "games" && left.gamesPlayed !== right.gamesPlayed) {
    return compareNumber(left.gamesPlayed, right.gamesPlayed, "desc");
  }

  return left.matchupKey.localeCompare(right.matchupKey);
}

function MatchupSortHeaderButton({
  active,
  direction,
  label,
  onClick
}: {
  active: boolean;
  direction?: SortDirection;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      className={[
        "mx-auto h-auto gap-1 p-0 text-center text-xs font-semibold uppercase tracking-wide transition hover:bg-transparent",
        active
          ? "text-card-foreground"
          : "text-muted-foreground hover:text-card-foreground"
      ].join(" ")}
      onClick={onClick}
      type="button"
      variant="ghost"
    >
      <span>{label}</span>
      <ChevronIcon
        className={[
          "h-3.5 w-3.5 transition",
          active ? "opacity-100" : "opacity-45",
          active && direction === "asc" ? "rotate-180" : ""
        ].join(" ")}
      />
    </Button>
  );
}

function ArchetypeMatchupsTable({ matchups }: { matchups: ArchetypeMatchupStats[] }) {
  const [sort, setSort] = useState<{ key: MatchupSortKey; direction: SortDirection }>(
    DEFAULT_MATCHUP_SORT
  );
  const visibleMatchups = useMemo(
    () =>
      matchups
        .filter((matchup) => matchup.gamesPlayed >= MIN_MATCHUP_GAMES)
        .toSorted((left, right) => compareMatchupsBySort(sort, left, right)),
    [matchups, sort]
  );

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
              <th className="px-3 py-2 text-center">
                <MatchupSortHeaderButton
                  active={sort.key === "games"}
                  direction={sort.key === "games" ? sort.direction : undefined}
                  label="Games"
                  onClick={() =>
                    setSort({
                      direction: getNextMatchupSortDirection("games", sort),
                      key: "games"
                    })
                  }
                />
              </th>
              <th className="px-3 py-2 text-center">
                <MatchupSortHeaderButton
                  active={sort.key === "record"}
                  direction={sort.key === "record" ? sort.direction : undefined}
                  label="Record"
                  onClick={() =>
                    setSort({
                      direction: getNextMatchupSortDirection("record", sort),
                      key: "record"
                    })
                  }
                />
              </th>
              <th className="py-2 pl-3 text-center">
                <MatchupSortHeaderButton
                  active={sort.key === "winRate"}
                  direction={sort.key === "winRate" ? sort.direction : undefined}
                  label="Win Rate"
                  onClick={() =>
                    setSort({
                      direction: getNextMatchupSortDirection("winRate", sort),
                      key: "winRate"
                    })
                  }
                />
              </th>
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
                <td className="px-3 py-2.5 text-center font-mono text-muted-foreground">
                  {formatMetric(matchup.gamesPlayed)}
                </td>
                <td className="px-3 py-2.5 text-center font-mono text-card-foreground">
                  {formatRecord(matchup.gamesWon, matchup.gamesLost)}
                </td>
                <td className={`py-2.5 pl-3 text-center font-mono font-semibold ${tone.textClassName}`}>
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
        <div className="rounded-lg border border-loss-border bg-loss-bg px-4 py-6 text-sm text-loss">
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
        <Card className="grid gap-5 border-0 bg-transparent p-0 ring-0 sm:border-transparent sm:bg-card sm:p-6 sm:ring-1 sm:ring-[var(--rim)]">
          <div className="hidden space-y-2 sm:block">
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
