import Link from "next/link";
import { CalendarIcon, ChevronIcon, MapPinIcon } from "@/components/ui/icons";
import { ItemTitle } from "@/components/ui/Typography";
import { PlayPokemonJudgeMark } from "@/components/ui/PlayPokemonJudgeMark";
import { TournamentCompetitionBadge } from "@/components/ui/TournamentCompetitionBadge";
import { formatLongDayDate } from "@/lib/client/date-format";
import { getTournamentRecord } from "@/lib/tournaments/display";
import { getTournamentJudgeRoleLabel, getTournamentPlacementLabel } from "@/lib/tournaments/options";
import type { TournamentSummary } from "@/types/index";
import styles from "./tournament/collection.module.css";

export function TournamentCollectionHeader() {
  return (
    <div aria-hidden="true" className={`${styles.columns} ${styles.listHeader}`}>
      <span>Event</span>
      <span className={styles.metricHeader}>Placement</span>
      <span className={styles.metricHeader}>Record</span>
      <span className={styles.metricHeader}>Points (CP/PP)</span>
      <span />
    </div>
  );
}

export function TournamentSummaryList({
  tournaments
}: {
  tournaments: readonly TournamentSummary[];
}) {
  return (
    <div className={styles.history}>
      <p className={`${styles.summary} sm:justify-self-end`}>
        {tournaments.length} {tournaments.length === 1 ? "event" : "events"}
        <span aria-hidden="true"> · </span>
        Most recent first
      </p>
      <div className={styles.collection}>
        <TournamentCollectionHeader />
        <ul aria-label="Saved Tournaments" role="list">
          {tournaments.map((tournament) => {
            const isJudge = tournament.participation === "judge";
            const placement = tournament.placement
              ? getTournamentPlacementLabel(tournament.placement)
              : "No placement";
            const date = formatLongDayDate(tournament.dateFrom);

            return (
              <li key={tournament.id}>
                <Link
                  className={`${styles.columns} ${styles.row}`}
                  href={`/tournaments/${tournament.id}`}
                  prefetch={false}
                >
                  <div className={styles.identity}>
                    <div className={styles.eventMarks}>
                      {isJudge ? <PlayPokemonJudgeMark className={styles.judgeMark} /> : null}
                      <TournamentCompetitionBadge
                        category={tournament.category}
                        className={styles.competitionBadge}
                      />
                    </div>
                    <div className={styles.identityText}>
                      <ItemTitle as="h2" className={styles.name}>{tournament.name}</ItemTitle>
                      <p className={styles.subtitle}>
                        <span className={styles.date}>
                          <CalendarIcon className={styles.dateIcon} />
                          {date}
                        </span>
                        {tournament.location ? (
                          <>
                            <span aria-hidden="true"> · </span>
                            <span className={styles.location}>
                              <MapPinIcon className={styles.locationIcon} />
                              {tournament.location}
                            </span>
                          </>
                        ) : null}
                      </p>
                      {tournament.tournamentIdentifier ? (
                        <p className={styles.identifier}>
                          Tournament ID {tournament.tournamentIdentifier}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {isJudge ? (
                    <p className={`${styles.metric} ${styles.judgeRole}`}>
                      <span className={styles.metricLabel}>Role</span>
                      <span className={styles.metricValue}>
                        {getTournamentJudgeRoleLabel(tournament.judgeRole)}
                      </span>
                    </p>
                  ) : (
                    <>
                      <p className={`${styles.metric} ${styles.placement}`}>
                        <span className={styles.metricLabel}>Placement</span>
                        <span className={styles.metricValue}>{placement}</span>
                      </p>
                      <p className={`${styles.metric} ${styles.record}`}>
                        <span className={styles.metricLabel}>Record</span>
                        <span className={styles.metricValue}>{getTournamentRecord(tournament.rounds)}</span>
                      </p>
                    </>
                  )}
                  <p className={`${styles.metric} ${styles.points}`}>
                    <span className={styles.metricLabel}>
                      {isJudge ? "Professor Points (PP)" : "Championship Points (CP)"}
                    </span>
                    <span className={styles.metricValue}>
                      {(isJudge
                        ? tournament.professorPoints
                        : tournament.championshipPoints) ?? "—"}
                    </span>
                  </p>
                  <ChevronIcon aria-hidden="true" className={styles.chevron} />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
