"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Tabs, TabsContent } from "@/components/shadcn/tabs";
import { ChevronIcon } from "@/components/ui/icons";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { SectionTitle } from "@/components/ui/Typography";
import { getBattleLogOpponentDisplayName } from "@/lib/battle-log/display";
import { compareDamageTotals } from "@/lib/stats/damage-comparison";
import { summarizeDamageTimelineWindow } from "@/lib/stats/damage-timeline";
import type {
  ArchetypeMatchupStats,
  LogDamageTimelinePoint,
  LogStatsOverview
} from "@/lib/db/logs";

type StatsTabsClientProps = {
  damageTimeline: LogDamageTimelinePoint[];
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
  const comparison = compareDamageTotals(
    overview.attackDamage,
    overview.opponentAttackDamage
  );

  if (comparison.leader === "self") {
    return {
      label: "Damage Advantage",
      value: `+${formatMetric(comparison.difference)}`,
      valueClassName: "text-win-strong"
    };
  }

  if (comparison.leader === "opponent") {
    return {
      label: "Damage Deficit",
      value: `-${formatMetric(comparison.difference)}`,
      valueClassName: "text-loss-strong"
    };
  }

  return {
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
      textClassName: "text-win-strong"
    };
  }

  if (value >= 50) {
    return {
      barClassName: "bg-warning",
      textClassName: "text-warning-strong"
    };
  }

  return {
    barClassName: "bg-loss",
    textClassName: "text-loss-strong"
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

function DamageSplitChart({
  attackDamage,
  damageTimeline,
  endGame,
  isTruncated,
  opponentAttackDamage,
  startGame
}: {
  attackDamage: number;
  damageTimeline: LogDamageTimelinePoint[];
  endGame: number;
  isTruncated: boolean;
  opponentAttackDamage: number;
  startGame: number;
}) {
  const chart = getDamageChartGeometry(damageTimeline, attackDamage, opponentAttackDamage);
  const rangeDescription = isTruncated
    ? ` for games ${formatMetric(startGame)} to ${formatMetric(endGame)}`
    : "";

  return (
    <div className="grid gap-5 rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Damage Split
          </h3>
        </div>
        <div className="flex flex-wrap justify-end gap-x-4 gap-y-1 text-xs font-medium text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[var(--chart-damage-self-start)]" />
            You dealt
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-loss" />
            Opponents dealt
          </span>
        </div>
      </div>

      <div
        aria-label={`Damage split line chart${rangeDescription}. You dealt ${formatMetric(attackDamage)}. Opponents dealt ${formatMetric(opponentAttackDamage)}.`}
        className="relative overflow-hidden p-3"
        role="img"
      >
        <svg
          aria-hidden="true"
          className="h-auto w-full"
          preserveAspectRatio="xMidYMid meet"
          viewBox={`0 0 ${chart.width} ${chart.height}`}
        >
          <defs>
            <linearGradient id="attack-damage-line" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="var(--chart-damage-self-start)" />
              <stop offset="100%" stopColor="var(--chart-damage-self-end)" />
            </linearGradient>
            <linearGradient id="opponent-damage-line" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="var(--color-loss)" />
              <stop offset="100%" stopColor="var(--chart-damage-opponent-end)" />
            </linearGradient>
          </defs>
          {chart.yTicks.map((tick) => (
            <g key={tick.value}>
              <line
                stroke="var(--border)"
                strokeDasharray="3 8"
                strokeOpacity="0.85"
                x1={chart.plotLeft}
                x2={chart.plotRight}
                y1={tick.y}
                y2={tick.y}
              />
              <text
                fill="var(--muted-foreground)"
                fontSize="11"
                textAnchor="end"
                x={chart.plotLeft - 10}
                y={tick.y + 4}
              >
                {formatCompactMetric(tick.value)}
              </text>
            </g>
          ))}
          <path
            d={chart.attackPath}
            fill="none"
            stroke="url(#attack-damage-line)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3.5"
          />
          <path
            d={chart.opponentPath}
            fill="none"
            stroke="url(#opponent-damage-line)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3.5"
          />
          <line
            stroke="var(--border)"
            strokeWidth="1"
            x1={chart.plotLeft}
            x2={chart.plotRight}
            y1={chart.plotBottom}
            y2={chart.plotBottom}
          />
          <circle cx={chart.lastX} cy={chart.lastAttackY} fill="var(--chart-damage-self-start)" r="4.5" />
          <circle cx={chart.lastX} cy={chart.lastOpponentY} fill="var(--color-loss)" r="4.5" />
          <text
            fill="var(--muted-foreground)"
            fontSize="11"
            textAnchor="start"
            x={chart.plotLeft}
            y={chart.height - 10}
          >
            Game {formatMetric(startGame)}
          </text>
          <text
            fill="var(--muted-foreground)"
            fontSize="11"
            textAnchor="end"
            x={chart.plotRight}
            y={chart.height - 10}
          >
            Game {formatMetric(endGame)}
          </text>
        </svg>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3 border-t border-border px-1 py-3">
            <span className="font-medium text-muted-foreground">
              You dealt{isTruncated ? " in window" : ""}
            </span>
            <span className="font-mono font-semibold text-card-foreground">{formatMetric(attackDamage)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border px-1 py-3">
            <span className="font-medium text-muted-foreground">
              Opponents dealt{isTruncated ? " in window" : ""}
            </span>
            <span className="font-mono font-semibold text-card-foreground">{formatMetric(opponentAttackDamage)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatCompactMetric(value: number) {
  if (value >= 1000) {
    return `${Math.round(value / 1000)}K`;
  }

  return String(value);
}

function getDamageChartGeometry(
  damageTimeline: LogDamageTimelinePoint[],
  attackDamage: number,
  opponentAttackDamage: number
) {
  const width = 560;
  const height = 260;
  const plotLeft = 54;
  const plotRight = width - 18;
  const plotTop = 18;
  const plotBottom = height - 38;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;
  const points =
    damageTimeline.length > 0
      ? damageTimeline
      : [{ date: "", selfAttackDamage: attackDamage, opponentAttackDamage }];
  let cumulativeAttack = 0;
  let cumulativeOpponent = 0;
  const cumulativePoints = points.map((point, index) => {
    cumulativeAttack += point.selfAttackDamage;
    cumulativeOpponent += point.opponentAttackDamage;

    return {
      attack: cumulativeAttack,
      index,
      opponent: cumulativeOpponent
    };
  });
  const maxDamage = Math.max(
    attackDamage,
    opponentAttackDamage,
    ...cumulativePoints.map((point) => Math.max(point.attack, point.opponent)),
    1
  );
  const tickStep = Math.max(1000, Math.ceil(maxDamage / 4 / 1000) * 1000);
  const maxTick = Math.ceil(maxDamage / tickStep) * tickStep;
  const yTicks = Array.from({ length: 5 }, (_, index) => {
    const value = Math.round((maxTick / 4) * index);

    return {
      value,
      y: plotBottom - (value / maxTick) * plotHeight
    };
  }).reverse();

  function xForIndex(index: number) {
    return plotLeft + (points.length === 1 ? plotWidth : (index / (points.length - 1)) * plotWidth);
  }

  function yForValue(value: number) {
    return plotBottom - (value / maxTick) * plotHeight;
  }

  function pathFor(key: "attack" | "opponent") {
    return cumulativePoints
      .map((point, index) => `${index === 0 ? "M" : "L"} ${xForIndex(point.index).toFixed(2)} ${yForValue(point[key]).toFixed(2)}`)
      .join(" ");
  }

  const lastPoint = cumulativePoints[cumulativePoints.length - 1] ?? {
    attack: attackDamage,
    index: 0,
    opponent: opponentAttackDamage
  };

  return {
    attackPath: pathFor("attack"),
    height,
    lastAttackY: yForValue(lastPoint.attack),
    lastOpponentY: yForValue(lastPoint.opponent),
    lastX: xForIndex(lastPoint.index),
    opponentPath: pathFor("opponent"),
    plotBottom,
    plotLeft,
    plotRight,
    width,
    yTicks
  };
}

function OverviewTile({
  label,
  value,
  valueClassName = "text-card-foreground"
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="min-h-24 p-5">
      <p className="text-xs font-semibold uppercase leading-none tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-3 text-2xl font-semibold leading-none [font-variant-numeric:tabular-nums] sm:text-3xl ${valueClassName}`}
      >
        {value}
      </p>
    </div>
  );
}

function GameStatRow({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-h-14 items-center gap-3 border-b border-border py-4 last:border-b-0">
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-card-foreground">
        {label}
      </span>
      <span className="font-mono text-lg font-semibold text-card-foreground">{value}</span>
    </div>
  );
}

function StatsOverviewGrid({
  damageTimeline,
  overview
}: {
  damageTimeline: LogDamageTimelinePoint[];
  overview: LogStatsOverview;
}) {
  const damageComparison = getDamageComparison(overview);
  const damageWindow = summarizeDamageTimelineWindow(
    damageTimeline,
    overview.gamesPlayed,
    overview.attackDamage,
    overview.opponentAttackDamage
  );
  const winRate = getOverviewWinRate(overview);

  return (
    <div className="grid gap-6">
      <OverviewSection title="Results">
        <div className="grid overflow-hidden rounded-lg border border-border bg-card [&>*+*]:border-t sm:grid-cols-2 sm:[&>*+*]:border-t-0 sm:[&>*:nth-child(2n)]:border-l sm:[&>*:nth-child(n+3)]:border-t xl:grid-cols-4 xl:[&>*:nth-child(n)]:border-l xl:[&>*:first-child]:border-l-0 xl:[&>*:nth-child(n+3)]:border-t-0">
          <OverviewTile
            label="Games Played"
            value={formatMetric(overview.gamesPlayed)}
          />
          <OverviewTile
            label="Win Rate"
            value={formatWinRate(winRate)}
            valueClassName="text-win-strong"
          />
          <OverviewTile
            label="Won"
            value={formatMetric(overview.gamesWon)}
            valueClassName="text-win-strong"
          />
          <OverviewTile
            label="Lost"
            value={formatMetric(overview.gamesLost)}
            valueClassName="text-loss-strong"
          />
        </div>
      </OverviewSection>

      <OverviewSection title="Damage">
        <div className="grid overflow-hidden rounded-lg border border-border bg-card [&>*+*]:border-t sm:grid-cols-2 sm:[&>*+*]:border-t-0 sm:[&>*:nth-child(2n)]:border-l sm:[&>*:nth-child(n+3)]:border-t lg:grid-cols-[1fr_1fr_1.45fr] lg:[&>*:nth-child(n)]:border-l lg:[&>*:first-child]:border-l-0 lg:[&>*:nth-child(n+3)]:border-t-0">
          <OverviewTile
            label="Attack Damage"
            value={formatMetric(overview.attackDamage)}
          />
          <OverviewTile
            label="Opponent Damage"
            value={formatMetric(overview.opponentAttackDamage)}
          />
          <OverviewTile
            label={damageComparison.label}
            value={damageComparison.value}
            valueClassName={damageComparison.valueClassName}
          />
        </div>
      </OverviewSection>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)]">
        <DamageSplitChart
          attackDamage={damageWindow.attackDamage}
          damageTimeline={damageTimeline}
          endGame={damageWindow.endGame}
          isTruncated={damageWindow.isTruncated}
          opponentAttackDamage={damageWindow.opponentAttackDamage}
          startGame={damageWindow.startGame}
        />

        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase leading-none tracking-wide text-muted-foreground">
            Game Stats
          </h2>
          <GameStatRow
            label="Prizes taken"
            value={formatMetric(overview.prizesTaken)}
          />
          <GameStatRow
            label="Opening coin toss W/L"
            value={formatRecord(overview.coinFlipsWon, overview.coinFlipsLost)}
          />
          <GameStatRow
            label="Mulligans taken"
            value={formatMetric(overview.mulligansTaken)}
          />
        </div>
      </div>
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
          "size-3.5 transition",
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
      [...matchups]
        .filter((matchup) => matchup.gamesPlayed >= MIN_MATCHUP_GAMES)
        .sort((left, right) => compareMatchupsBySort(sort, left, right)),
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

export function StatsTabsClient({
  damageTimeline,
  matchups: initialMatchups,
  overview
}: StatsTabsClientProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [matchups, setMatchups] = useState<ArchetypeMatchupStats[] | null>(
    initialMatchups ?? null
  );
  const [isLoadingMatchups, setIsLoadingMatchups] = useState(false);
  const [matchupsError, setMatchupsError] = useState("");

  useEffect(() => {
    if (activeTab !== "matchups" || matchups) {
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
  }, [activeTab, matchups]);

  const matchupContent = useMemo(() => {
    if (matchupsError) {
      return (
        <div className="rounded-lg border border-loss-border bg-loss-bg px-4 py-6 text-sm text-loss-strong">
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
      <Tabs
        className="-mt-2 gap-6 sm:mt-5"
        defaultValue="overview"
        onValueChange={setActiveTab}
        value={activeTab}
      >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl
          ariaLabel="Stats sections"
          options={[
            { value: "overview", label: "Overview" },
            { value: "matchups", label: "Matchups" }
          ]}
        />
        <div className="inline-flex h-11 w-fit items-center gap-2 rounded-lg border border-border bg-card/80 px-4 text-sm font-medium text-card-foreground shadow-sm">
          <span>All time</span>
        </div>
      </div>

      <TabsContent value="overview">
        <StatsOverviewGrid damageTimeline={damageTimeline} overview={overview} />
      </TabsContent>

      <TabsContent value="matchups">
        <div className="grid gap-4">
          <div className="space-y-2">
            <p className="ui-eyebrow">Matchups</p>
            <SectionTitle>Win % vs Archetypes</SectionTitle>
          </div>

          {matchupContent}
        </div>
      </TabsContent>
    </Tabs>
  );
}
