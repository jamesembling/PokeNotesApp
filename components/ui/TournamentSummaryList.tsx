import Link from "next/link";
import { ChevronIcon, MapPinIcon } from "@/components/ui/icons";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { ItemTitle } from "@/components/ui/Typography";
import { PlayPokemonJudgeMark } from "@/components/ui/PlayPokemonJudgeMark";
import { TournamentCompetitionBadge } from "@/components/ui/TournamentCompetitionBadge";
import { formatDayDate } from "@/lib/client/date-format";
import { getTournamentRecord } from "@/lib/tournaments/display";
import {
  getTournamentCategoryLabel,
  getTournamentJudgeRoleLabel,
  getTournamentPlacementLabel
} from "@/lib/tournaments/options";
import type { TournamentSummary } from "@/types/index";
import styles from "./tournament/collection.module.css";

export function TournamentCollectionHeader() {
  return (
    <div aria-hidden="true" className={`${styles.columns} ${styles.listHeader}`}>
      <span />
      <span>Event</span>
      <span className={styles.metricHeader}>Placement</span>
      <span className={styles.metricHeader}>Record</span>
      <span className={styles.metricHeader}>Points (CP)</span>
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
            const subtitle = [
              formatDayDate(tournament.dateFrom),
              tournament.category ? getTournamentCategoryLabel(tournament.category) : ""
            ].filter(Boolean).join(" · ");

            return (
              <li key={tournament.id}>
                <Link
                  className={`${styles.columns} ${styles.row}`}
                  href={`/tournaments/${tournament.id}`}
                  prefetch={false}
                >
                  <div className={styles.sprites}>
                    {isJudge ? (
                      <PlayPokemonJudgeMark className="size-12" />
                    ) : (
                      <SpriteStrip className="-space-x-2 gap-0" size="lg" sprites={tournament.deckSprites} />
                    )}
                  </div>
                  <div className={styles.identity}>
                    <TournamentCompetitionBadge
                      category={tournament.category}
                      className={styles.competitionBadge}
                    />
                    <div className={styles.identityText}>
                      <ItemTitle as="h2" className={styles.name}>{tournament.name}</ItemTitle>
                      <p className={styles.subtitle}>
                        {subtitle}
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
                    <span className={styles.metricLabel}>Championship Points (CP)</span>
                    <span className={styles.metricValue}>
                      {tournament.championshipPoints ?? "—"}
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
