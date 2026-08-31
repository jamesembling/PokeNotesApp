"use client";

import { useId, useMemo, useState } from "react";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { ChevronIcon } from "@/components/ui/icons";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { SectionTitle } from "@/components/ui/Typography";
import { getBattleLogOpponentDisplayName } from "@/lib/battle-log/deck-display";
import type { ArchetypeMatchupStats } from "@/lib/db/logs";
import styles from "./matchups.module.css";

type SortKey = "games" | "record" | "winRate";
type SortDirection = "asc" | "desc";
type MatchupSort = { key: SortKey; direction: SortDirection };

const MIN_MATCHUP_GAMES = 3;
const SORT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: "games", label: "Games" },
  { key: "record", label: "Record" },
  { key: "winRate", label: "Win rate" }
];

function compareNumber(left: number, right: number, direction: SortDirection) {
  return direction === "asc" ? left - right : right - left;
}

function compareMatchups(
  left: ArchetypeMatchupStats,
  right: ArchetypeMatchupStats,
  sort: MatchupSort
) {
  let result = 0;

  switch (sort.key) {
    case "games":
      result = compareNumber(left.gamesPlayed, right.gamesPlayed, sort.direction);
      break;
    case "record":
      result = compareNumber(left.gamesWon, right.gamesWon, sort.direction);
      if (result === 0) {
        result = compareNumber(
          left.gamesLost,
          right.gamesLost,
          sort.direction === "asc" ? "desc" : "asc"
        );
      }
      break;
    case "winRate":
      result = compareNumber(left.winRate ?? -1, right.winRate ?? -1, sort.direction);
      break;
  }

  if (result !== 0) return result;

  if (sort.key !== "winRate" && left.winRate !== right.winRate) {
    return compareNumber(left.winRate ?? -1, right.winRate ?? -1, "desc");
  }

  if (sort.key !== "games" && left.gamesPlayed !== right.gamesPlayed) {
    return compareNumber(left.gamesPlayed, right.gamesPlayed, "desc");
  }

  return left.matchupKey.localeCompare(right.matchupKey);
}

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function StatsMatchups({ matchups }: { matchups: ArchetypeMatchupStats[] }) {
  const titleId = useId();
  const searchId = useId();
  const sampleId = useId();
  const sampleNoteId = useId();
  const tableNoteId = useId();
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [sort, setSort] = useState<MatchupSort>({ key: "winRate", direction: "desc" });

  const namedMatchups = useMemo(
    () => matchups.map((matchup) => {
      const displayName = getBattleLogOpponentDisplayName(
        matchup.opponentDeckName,
        matchup.opponentDeckSprites
      ) || matchup.matchupKey;

      return {
        matchup,
        displayName,
        searchName: normalizeSearch(`${displayName} ${matchup.opponentDeckName}`)
      };
    }),
    [matchups]
  );

  const normalizedQuery = normalizeSearch(query);
  const visibleMatchups = useMemo(
    () => namedMatchups
      .filter(({ matchup, searchName }) =>
        (showAll || matchup.gamesPlayed >= MIN_MATCHUP_GAMES) &&
        searchName.includes(normalizedQuery)
      )
      .sort((left, right) => compareMatchups(left.matchup, right.matchup, sort)),
    [namedMatchups, normalizedQuery, showAll, sort]
  );

  function changeSort(key: SortKey) {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "desc" ? "asc" : "desc"
    }));
  }

  return (
    <section aria-labelledby={titleId} className={styles.section}>
      <header className={styles.header}>
        <SectionTitle id={titleId} size="lg">Know your matchups.</SectionTitle>
        <p className={styles.intro}>
          Your all-time record against each opponent archetype, across every Deck Strategy.
        </p>
      </header>

      {matchups.length > 0 ? (
        <>
          <div className={styles.toolbar}>
            <div className={styles.search}>
              <label className={styles.searchLabel} htmlFor={searchId}>Find an archetype</label>
              <Input
                autoComplete="off"
                className={`${styles.searchInput} dark:bg-transparent`}
                id={searchId}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name"
                type="search"
                value={query}
              />
            </div>
            <div className={styles.sampleControl}>
              <label className={styles.checkboxLabel} htmlFor={sampleId}>
                <input
                  aria-describedby={sampleNoteId}
                  checked={showAll}
                  className={styles.checkbox}
                  id={sampleId}
                  onChange={(event) => setShowAll(event.target.checked)}
                  type="checkbox"
                />
                <span>Show all matchups</span>
              </label>
              <p className={styles.sampleNote} id={sampleNoteId}>
                Includes samples of fewer than {MIN_MATCHUP_GAMES} games.
              </p>
            </div>
          </div>

          <div className={styles.tableMeta}>
            <p aria-live="polite" role="status">
              Showing <strong>{visibleMatchups.length.toLocaleString()}</strong> of{" "}
              {matchups.length.toLocaleString()} archetypes
            </p>
            <p>{showAll ? "All sample sizes" : `${MIN_MATCHUP_GAMES}+ games per matchup`}</p>
          </div>

          <table aria-describedby={tableNoteId} className={styles.table}>
            <caption className="sr-only">
              All-time results against identified opponent archetypes. Select a column heading to sort.
            </caption>
            <colgroup>
              <col className={styles.archetypeColumn} />
              <col className={styles.gamesColumn} />
              <col className={styles.recordColumn} />
              <col className={styles.rateColumn} />
            </colgroup>
            <thead>
              <tr>
                <th className={styles.identityHeader} scope="col">Archetype</th>
                {SORT_COLUMNS.map(({ key, label }) => {
                  const active = sort.key === key;
                  const nextDirection = active && sort.direction === "desc" ? "ascending" : "descending";

                  return (
                    <th
                      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                      className={styles.numberHeader}
                      key={key}
                      scope="col"
                    >
                      <Button
                        aria-label={`Sort by ${label.toLowerCase()}, ${nextDirection}`}
                        className={styles.sortButton}
                        data-active={active || undefined}
                        onClick={() => changeSort(key)}
                        variant="ghost"
                      >
                        <span>{label}</span>
                        <ChevronIcon
                          className={`${styles.sortIcon} size-3 ${active && sort.direction === "asc" ? styles.sortAscending : ""}`}
                        />
                      </Button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visibleMatchups.map(({ matchup, displayName }) => (
                <tr key={matchup.matchupKey}>
                  <th className={styles.identityCell} scope="row">
                    <div className={styles.identity}>
                      <SpriteStrip
                        className={styles.sprites}
                        maxVisible={2}
                        size="sm"
                        sprites={matchup.opponentDeckSprites}
                      />
                      <div className={styles.nameBlock}>
                        <span className={styles.name}>{displayName}</span>
                        {matchup.gamesPlayed < MIN_MATCHUP_GAMES ? (
                          <span className={styles.smallSample}>Small sample</span>
                        ) : null}
                      </div>
                    </div>
                  </th>
                  <td className={`${styles.numberCell} ${styles.games}`}>
                    {matchup.gamesPlayed.toLocaleString()}
                  </td>
                  <td className={`${styles.numberCell} ${styles.record}`}>
                    <span aria-hidden="true">
                      {matchup.gamesWon.toLocaleString()}–{matchup.gamesLost.toLocaleString()}
                    </span>
                    <span className="sr-only">
                      {matchup.gamesWon.toLocaleString()} wins, {matchup.gamesLost.toLocaleString()} losses
                    </span>
                  </td>
                  <td className={`${styles.numberCell} ${styles.winRate}`}>
                    {matchup.winRate === null ? (
                      <><span aria-hidden="true">—</span><span className="sr-only">Unavailable</span></>
                    ) : (
                      <>{matchup.winRate}<span className={styles.percent}>%</span></>
                    )}
                  </td>
                </tr>
              ))}
              {visibleMatchups.length === 0 ? (
                <tr>
                  <td className={styles.emptyCell} colSpan={4}>
                    <p className={styles.emptyTitle}>
                      {normalizedQuery ? "No matching archetypes." : "Your matchup history is taking shape."}
                    </p>
                    <p className={styles.emptyDescription}>
                      {normalizedQuery
                        ? "Try another name or include smaller samples."
                        : `No archetype has ${MIN_MATCHUP_GAMES} games yet. Show all matchups to see your early results.`}
                    </p>
                    <Button
                      className={styles.emptyAction}
                      onClick={() => normalizedQuery ? setQuery("") : setShowAll(true)}
                      variant="outline"
                    >
                      {normalizedQuery ? "Clear search" : "Show all matchups"}
                    </Button>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>

          <p className={styles.footnote} id={tableNoteId}>
            Record is wins–losses. Win rate uses all games. Unidentified opponents are excluded.
            {" "}Small samples are an early signal, not a reliable matchup estimate.
          </p>
        </>
      ) : (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Your next opponent starts the story.</p>
          <p className={styles.emptyDescription}>
            Import Battle Logs with identified opponent archetypes to build your matchup record.
            Unidentified opponents are excluded.
          </p>
        </div>
      )}
    </section>
  );
}
