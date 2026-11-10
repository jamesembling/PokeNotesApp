import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { MapPinIcon } from "@/components/ui/icons";
import { PlayPokemonJudgeMark } from "@/components/ui/PlayPokemonJudgeMark";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { TournamentCompetitionBadge } from "@/components/ui/TournamentCompetitionBadge";
import { ItemTitle, SectionTitle } from "@/components/ui/Typography";
import { getBattleLogOpponentDisplayName } from "@/lib/battle-log/deck-display";
import { formatDayDate } from "@/lib/client/date-format";
import type {
  LogDamageTimelinePoint,
  LogStatsOverview
} from "@/lib/db/logs";
import type { getLogsWindow } from "@/lib/db/logs";
import {
  type getTournamentSummaries,
  TournamentSchemaMissingError
} from "@/lib/db/tournaments";
import { getRecentPerformance } from "@/lib/stats/performance";
import { getTournamentRecord } from "@/lib/tournaments/display";
import {
  getTournamentCategoryLabel,
  getTournamentJudgeRoleLabel,
  getTournamentPlacementLabel
} from "@/lib/tournaments/options";
import styles from "./dashboard.module.css";

const number = new Intl.NumberFormat("en-GB");

type DashboardOverviewProps = {
  battleLogs: ReactNode;
  stats: ReactNode;
  tournaments: ReactNode;
  events: ReactNode;
};

function DashboardOverviewRoot({ battleLogs, stats, tournaments, events }: DashboardOverviewProps) {
  return (
    <div className={styles.overview}>
      {stats}
      <div className={styles.activityGrid}>
        {battleLogs}
        {tournaments}
      </div>
      {events}
    </div>
  );
}

function SectionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className={styles.sectionLink} href={href} prefetch={false}>
      {children}
      <ArrowUpRight aria-hidden="true" size={16} />
    </Link>
  );
}

async function DashboardPointTotals({
  dataPromise
}: {
  dataPromise: ReturnType<typeof getTournamentSummaries>;
}) {
  let tournaments: Awaited<ReturnType<typeof getTournamentSummaries>> = [];
  let pointsUnavailable = false;

  try {
    tournaments = await dataPromise;
  } catch (error) {
    if (!(error instanceof TournamentSchemaMissingError)) {
      throw error;
    }

    pointsUnavailable = true;
  }

  const totals = tournaments.reduce(
    (current, tournament) => ({
      championship: current.championship + (tournament.championshipPoints ?? 0),
      professor: current.professor + (tournament.professorPoints ?? 0)
    }),
    { championship: 0, professor: 0 }
  );

  return (
    <dl aria-label="Tournament point totals" className={styles.pointTotals}>
      <div className={styles.pointTotal}>
        <dt>Champ Points</dt>
        <dd>{pointsUnavailable ? "—" : number.format(totals.championship)}</dd>
      </div>
      <div className={styles.pointTotal}>
        <dt>Professor Points</dt>
        <dd>{pointsUnavailable ? "—" : number.format(totals.professor)}</dd>
      </div>
    </dl>
  );
}

async function DashboardStats({
  dataPromise
}: {
  dataPromise: Promise<[LogStatsOverview, LogDamageTimelinePoint[]]>;
}) {
  const [overview, timeline] = await dataPromise;
  const knownResults = overview.gamesWon + overview.gamesLost;
  const winRate = knownResults > 0 ? Math.round((overview.gamesWon / knownResults) * 100) : null;
  const unknownResults = Math.max(0, overview.gamesPlayed - knownResults);
  const recent = getRecentPerformance(timeline, overview.gamesPlayed, 10);

  return (
    <section aria-labelledby="dashboard-stats-title" className={styles.stats}>
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>Overall performance</p>
          <SectionTitle id="dashboard-stats-title" size="lg">Your record at a glance</SectionTitle>
        </div>
        <SectionLink href="/stats">Open Stats</SectionLink>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.primaryStat}>
          <p aria-label={winRate === null ? "No recorded win rate" : `${winRate}% win rate`} className={styles.winRate}>
            {winRate ?? "—"}{winRate !== null ? <span>%</span> : null}
          </p>
          <p className={styles.statLabel}>All-time win rate</p>
        </div>
        <dl className={styles.record}>
          <div><dt>Won</dt><dd>{number.format(overview.gamesWon)}</dd></div>
          <div><dt>Lost</dt><dd>{number.format(overview.gamesLost)}</dd></div>
          <div><dt>Played</dt><dd>{number.format(overview.gamesPlayed)}</dd></div>
        </dl>
        <div className={styles.form}>
          <div className={styles.formHeading}>
            <span>Latest form</span>
            <span>{recent.recentResults.length} games</span>
          </div>
          {recent.recentResults.length > 0 ? (
            <ol aria-label="Latest game results, oldest to newest" className={styles.results}>
              {recent.recentResults.map((game) => (
                <li data-result={game.result ?? "unknown"} key={game.gameNumber}>
                  <span aria-hidden="true">{game.result === "Win" ? "W" : game.result === "Loss" ? "L" : "—"}</span>
                  <span className="sr-only">Game {game.gameNumber}: {game.result ?? "No result"}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.emptyCopy}>Import a Battle Log to start your record.</p>
          )}
          {unknownResults > 0 ? (
            <p className={styles.supportingCopy}>{number.format(unknownResults)} without a recorded result</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

async function DashboardBattleLogs({
  dataPromise
}: {
  dataPromise: ReturnType<typeof getLogsWindow>;
}) {
  const { logs } = await dataPromise;

  return (
    <section aria-labelledby="dashboard-logs-title" className={styles.activitySection}>
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>Latest activity</p>
          <SectionTitle id="dashboard-logs-title">Battle Logs</SectionTitle>
        </div>
        <SectionLink href="/logs">View all</SectionLink>
      </div>
      {logs.length > 0 ? (
        <ul aria-label="Latest Battle Logs" className={styles.activityList}>
          {logs.map((log) => {
            const opponent = getBattleLogOpponentDisplayName(log.opponentDeckName, log.opponentDeckSprites);
            return (
              <li key={log.id}>
                <Link className={styles.activityRow} href={`/logs/${log.id}`} prefetch={false}>
                  <span className={styles.result} data-result={log.result.toLowerCase()}>{log.result === "Win" ? "W" : "L"}</span>
                  <div className={styles.activityIdentity}>
                    <ItemTitle as="h3" size="sm">{opponent}</ItemTitle>
                    <p>{formatDayDate(log.date)} · {log.goOrder ? `Went ${log.goOrder.toLowerCase()}` : "Order unknown"}</p>
                  </div>
                  <SpriteStrip className={styles.rowSprites} size="md" sprites={log.opponentDeckSprites.slice(0, 2)} />
                  <ArrowUpRight aria-hidden="true" className={styles.rowArrow} size={17} />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.emptyCopy}>No Battle Logs saved yet.</p>
      )}
    </section>
  );
}

async function DashboardTournaments({
  dataPromise
}: {
  dataPromise: ReturnType<typeof getTournamentSummaries>;
}) {
  let tournaments: Awaited<ReturnType<typeof getTournamentSummaries>> = [];
  let tournamentsUnavailable = false;

  try {
    tournaments = (await dataPromise).slice(0, 3);
  } catch (error) {
    if (!(error instanceof TournamentSchemaMissingError)) {
      throw error;
    }

    tournamentsUnavailable = true;
  }

  return (
    <section aria-labelledby="dashboard-tournaments-title" className={styles.activitySection}>
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>Recent competition</p>
          <SectionTitle id="dashboard-tournaments-title">Tournaments</SectionTitle>
        </div>
        <SectionLink href="/tournaments">View all</SectionLink>
      </div>
      {tournaments.length > 0 ? (
        <ul aria-label="Latest Tournaments" className={styles.activityList}>
          {tournaments.map((tournament) => {
            const isJudge = tournament.participation === "judge";
            const placement = tournament.placement
              ? getTournamentPlacementLabel(tournament.placement)
              : "No placement";
            const category = tournament.category ? getTournamentCategoryLabel(tournament.category) : "Tournament";
            const points = isJudge ? tournament.professorPoints : tournament.championshipPoints;
            return (
              <li key={tournament.id}>
                <Link className={`${styles.activityRow} ${styles.tournamentRow}`} href={`/tournaments/${tournament.id}`} prefetch={false}>
                  <div className={styles.tournamentMarks}>
                    {isJudge ? <PlayPokemonJudgeMark className={styles.tournamentMark} /> : null}
                    <TournamentCompetitionBadge
                      category={tournament.category}
                      className={styles.tournamentMark}
                    />
                  </div>
                  <div className={styles.activityIdentity}>
                    <ItemTitle as="h3" size="sm">{tournament.name}</ItemTitle>
                    <p>{formatDayDate(tournament.dateFrom)} · {category}</p>
                    {tournament.location || tournament.tournamentIdentifier ? (
                      <p className={styles.tournamentDetails}>
                        {tournament.location ? (
                          <span>
                            <MapPinIcon className={styles.tournamentDetailIcon} />
                            {tournament.location}
                          </span>
                        ) : null}
                        {tournament.location && tournament.tournamentIdentifier ? (
                          <span aria-hidden="true">·</span>
                        ) : null}
                        {tournament.tournamentIdentifier ? (
                          <span>ID {tournament.tournamentIdentifier}</span>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                  <div className={styles.tournamentRecord}>
                    <span>{isJudge ? getTournamentJudgeRoleLabel(tournament.judgeRole) : placement}</span>
                    <span>
                      {[
                        isJudge ? null : getTournamentRecord(tournament.rounds),
                        points == null ? null : `${points} ${isJudge ? "PP" : "CP"}`
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  <ArrowUpRight aria-hidden="true" className={styles.rowArrow} size={17} />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.emptyCopy}>
          {tournamentsUnavailable ? "Tournament tracking is temporarily unavailable." : "No Tournaments saved yet."}
        </p>
      )}
    </section>
  );
}

export const DashboardOverview = Object.assign(DashboardOverviewRoot, {
  BattleLogs: DashboardBattleLogs,
  PointTotals: DashboardPointTotals,
  Stats: DashboardStats,
  Tournaments: DashboardTournaments
});
