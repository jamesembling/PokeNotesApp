"use client";

import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import { SectionTitle } from "@/components/ui/Typography";
import type { getRecentPerformance, PerformanceTrendPoint } from "@/lib/stats/performance";
import styles from "./chart.module.css";

type PerformanceChartProps = {
  performance: ReturnType<typeof getRecentPerformance>;
  allTimeWinRate: number | null;
};

const WIDTH = 620;
const HEIGHT = 225;
const LEFT = 42;
const RIGHT = 594;
const TOP = 30;
const BOTTOM = 194;
const TICKS = [100, 75, 50, 25, 0];
const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC"
});

function formatDate(value: string) {
  if (!value) return "Date unavailable";
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : dateFormatter.format(date);
}

function yForRate(value: number) {
  return BOTTOM - (Math.max(0, Math.min(100, value)) / 100) * (BOTTOM - TOP);
}

function chartGeometry(trend: readonly PerformanceTrendPoint[]) {
  const points = trend.slice(-50).map((point, index, visible) => ({
    ...point,
    x: visible.length === 1 ? RIGHT : LEFT + (index / (visible.length - 1)) * (RIGHT - LEFT),
    y: point.winRate === null ? null : yForRate(point.winRate)
  }));
  let previousWasKnown = false;
  const path = points.map((point) => {
    if (point.y === null) {
      previousWasKnown = false;
      return "";
    }
    const command = previousWasKnown ? "L" : "M";
    previousWasKnown = true;
    return `${command}${point.x.toFixed(2)},${point.y.toFixed(2)}`;
  }).join(" ");
  const isolated = points.filter((point, index) =>
    point.y !== null && points[index - 1]?.y == null && points[index + 1]?.y == null
  );

  return { points, path, isolated };
}

function describePoint(point: PerformanceTrendPoint) {
  const rate = point.winRate === null ? "Win rate unavailable" : `${point.winRate} percent win rate`;
  return `Game ${point.gameNumber}, ${formatDate(point.playedAt)}. ${rate}. ${point.wins} wins and ${point.losses} losses from ${point.knownResults} known results in ${point.gamesPlayed} games.`;
}

export function PerformanceChart({ performance, allTimeWinRate }: PerformanceChartProps) {
  const titleId = useId();
  const methodId = useId();
  const keyboardId = useId();
  const [selectedGame, setSelectedGame] = useState<number | null>(null);
  const chart = useMemo(() => chartGeometry(performance.trend), [performance.trend]);
  const savedIndex = selectedGame === null ? -1 : chart.points.findIndex((point) => point.gameNumber === selectedGame);
  const selectedIndex = savedIndex >= 0 ? savedIndex : chart.points.length - 1;
  const selected = chart.points[selectedIndex];
  const first = chart.points[0];
  const latest = chart.points.at(-1);
  const comparison = performance.knownResults >= 20 && performance.winRate !== null && allTimeWinRate !== null
    ? performance.winRate - allTimeWinRate
    : null;

  function selectFromPointer(event: PointerEvent<HTMLDivElement>) {
    if (chart.points.length === 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0) return;
    const position = ((event.clientX - bounds.left) / bounds.width) * WIDTH;
    const fraction = Math.max(0, Math.min(1, (position - LEFT) / (RIGHT - LEFT)));
    const point = chart.points[Math.round(fraction * (chart.points.length - 1))];
    setSelectedGame(point.gameNumber);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    let index = selectedIndex;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        index -= 1;
        break;
      case "ArrowRight":
      case "ArrowUp":
        index += 1;
        break;
      case "Home":
        index = 0;
        break;
      case "End":
        index = chart.points.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const point = chart.points[Math.max(0, Math.min(chart.points.length - 1, index))];
    if (point) setSelectedGame(point.gameNumber);
  }

  return (
    <section aria-labelledby={titleId} className={styles.section}>
      <div className={styles.header}>
        <div className={styles.heading}>
          <SectionTitle id={titleId}>Recent form</SectionTitle>
          <p className={styles.scope}>
            {performance.gamesPlayed > 0
              ? `Last ${performance.gamesPlayed.toLocaleString()} ${performance.gamesPlayed === 1 ? "game" : "games"}`
              : "Your recent Battle Logs"}
          </p>
        </div>
        <div className={styles.summary}>
          <p aria-label={performance.winRate === null ? "Recent win rate unavailable" : `${performance.winRate} percent recent win rate`} className={styles.rate}>
            {performance.winRate === null ? "—" : <>{performance.winRate}<span>%</span></>}
          </p>
          <p className={styles.comparison}>
            {comparison === null
              ? `${performance.gamesWon.toLocaleString()}W – ${performance.gamesLost.toLocaleString()}L`
              : comparison === 0
                ? "Matches all-time win rate"
                : <>{comparison > 0 ? "+" : ""}{comparison} <abbr title="percentage points">pp</abbr> vs all time</>}
          </p>
        </div>
      </div>

      {selected && first && latest ? (
        <>
          <div
            aria-describedby={`${methodId} ${keyboardId}`}
            aria-label="Explore recent form by game"
            aria-orientation="horizontal"
            aria-valuemax={latest.gameNumber}
            aria-valuemin={first.gameNumber}
            aria-valuenow={selected.gameNumber}
            aria-valuetext={describePoint(selected)}
            className={styles.plot}
            onKeyDown={handleKeyDown}
            onPointerDown={(event) => {
              selectFromPointer(event);
              event.currentTarget.focus({ preventScroll: true });
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (event.pointerType === "mouse" || event.buttons === 1) selectFromPointer(event);
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            role="slider"
            tabIndex={0}
          >
            <svg aria-hidden="true" className={styles.svg} preserveAspectRatio="none" viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
              {TICKS.map((tick) => (
                <line
                  className={tick === 50 ? styles.baseline : styles.gridLine}
                  key={tick}
                  vectorEffect="non-scaling-stroke"
                  x1={LEFT}
                  x2={RIGHT}
                  y1={yForRate(tick)}
                  y2={yForRate(tick)}
                />
              ))}
              <path className={styles.formLine} d={chart.path} vectorEffect="non-scaling-stroke" />
              <line className={styles.crosshair} vectorEffect="non-scaling-stroke" x1={selected.x} x2={selected.x} y1={TOP} y2={BOTTOM} />
              {selected.y !== null ? (
                <line className={styles.crosshair} vectorEffect="non-scaling-stroke" x1={LEFT} x2={selected.x} y1={selected.y} y2={selected.y} />
              ) : null}
            </svg>
            {chart.isolated.map((point) => (
              <span aria-hidden="true" className={styles.isolatedPoint} key={point.gameNumber} style={{ left: `${point.x / WIDTH * 100}%`, top: `${(point.y ?? 0) / HEIGHT * 100}%` }} />
            ))}
            {selected.y !== null ? <span aria-hidden="true" className={styles.selectedPoint} style={{ left: `${selected.x / WIDTH * 100}%`, top: `${selected.y / HEIGHT * 100}%` }} /> : null}
            {TICKS.map((tick) => (
              <span aria-hidden="true" className={styles.axisLabel} key={tick} style={{ top: `${yForRate(tick) / HEIGHT * 100}%` }}>{tick}</span>
            ))}
            <span aria-hidden="true" className={styles.axisUnit}>Win %</span>
            {chart.points.length > 1 ? <span aria-hidden="true" className={styles.startLabel}>Game {first.gameNumber.toLocaleString()}</span> : null}
            <span aria-hidden="true" className={styles.endLabel}>Game {latest.gameNumber.toLocaleString()}</span>
            {chart.points.every((point) => point.winRate === null) ? <p className={styles.noKnownResults}>No known results in this window.</p> : null}
          </div>

          <div className={styles.selection}>
            <div className={styles.selectedGame}>
              <p className={styles.selectedDate}>Game {selected.gameNumber.toLocaleString()} · {formatDate(selected.playedAt)}</p>
              <p className={styles.selectedRecord}>
                {selected.wins}W – {selected.losses}L in {selected.gamesPlayed} {selected.gamesPlayed === 1 ? "game" : "games"}
                {selected.knownResults < selected.gamesPlayed ? ` · ${selected.gamesPlayed - selected.knownResults} unknown` : ""}
              </p>
            </div>
            <p className={styles.selectedRate}>
              {selected.winRate === null ? "—" : `${selected.winRate}%`}
              <span>rolling win rate</span>
            </p>
          </div>
          <p className={styles.method} id={methodId}>
            {latest.gamesPlayed < 20
              ? `Building your form line · ${latest.gamesPlayed} of 20 games`
              : "20-game rolling win rate · explore the line"}
          </p>
          <p className="sr-only" id={keyboardId}>Use the arrow keys to explore games. Home selects the first game and End selects the latest.</p>
        </>
      ) : (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>{performance.totalGames > 0 ? "Recent form unavailable" : "Your form starts with a game."}</p>
          <p>{performance.totalGames > 0 ? "Recent results are unavailable. Your all-time totals remain separate." : "Import a Battle Log to start tracking how your results develop."}</p>
        </div>
      )}
      {performance.unknownResults > 0 ? (
        <p className={styles.footnote}>{performance.unknownResults.toLocaleString()} {performance.unknownResults === 1 ? "game has" : "games have"} no known result and {performance.unknownResults === 1 ? "is" : "are"} excluded from win rates.</p>
      ) : null}
      {!performance.isWindowComplete ? <p className={styles.footnote}>Only {performance.loadedGames.toLocaleString()} of {performance.totalGames.toLocaleString()} saved games are available in this history window.</p> : null}
    </section>
  );
}
