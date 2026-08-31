import Link from "next/link";
import { ChevronIcon } from "@/components/ui/icons";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SpriteStrip } from "@/components/ui/SpriteStrip";
import { ItemTitle } from "@/components/ui/Typography";
import { formatDayDate } from "@/lib/client/date-format";
import { getTournamentRecord } from "@/lib/tournaments/display";
import { getTournamentCategoryLabel, getTournamentPlacementLabel } from "@/lib/tournaments/options";
import type { TournamentSummary } from "@/types/index";
import styles from "./tournament/collection.module.css";

export function TournamentCollectionHeader() {
  return (
    <div aria-hidden="true" className={`${styles.columns} ${styles.listHeader}`}>
      <span />
      <span>Event</span>
      <span>Placement</span>
      <span className={styles.alignEnd}>Record</span>
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
    <section className={styles.history} aria-labelledby="tournament-history-heading">
      <SectionHeader
        actions={
          <p className={styles.summary}>
            {tournaments.length} {tournaments.length === 1 ? "event" : "events"}
            <span aria-hidden="true"> · </span>
            Most recent first
          </p>
        }
        title="Tournament history"
        titleId="tournament-history-heading"
      />
      <div className={styles.collection}>
        <TournamentCollectionHeader />
        <ul aria-label="Saved Tournaments" role="list">
          {tournaments.map((tournament) => {
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
                    <SpriteStrip className="-space-x-2 gap-0" size="lg" sprites={tournament.deckSprites} />
                  </div>
                  <div className={styles.identity}>
                    <ItemTitle className={styles.name}>{tournament.name}</ItemTitle>
                    <p className={styles.subtitle}>{subtitle}</p>
                  </div>
                  <p className={styles.metric}>
                    <span className={styles.metricLabel}>Placement</span>
                    <span className={styles.metricValue}>{placement}</span>
                  </p>
                  <p className={`${styles.metric} ${styles.record}`}>
                    <span className={styles.metricLabel}>Record</span>
                    <span className={styles.metricValue}>{getTournamentRecord(tournament.rounds)}</span>
                  </p>
                  <ChevronIcon aria-hidden="true" className={styles.chevron} />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
