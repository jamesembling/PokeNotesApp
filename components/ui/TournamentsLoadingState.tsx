import { Skeleton } from "@/components/shadcn/skeleton";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { TournamentCollectionHeader } from "@/components/ui/TournamentSummaryList";
import styles from "./tournament/collection.module.css";

export function TournamentsContentLoadingState() {
  return (
    <div aria-busy="true" className={styles.history} role="status">
      <span className="sr-only">Loading Tournaments</span>
      <SectionHeader
        actions={<Skeleton aria-hidden="true" className="h-5 w-40" />}
        title="Tournament history"
      />
      <div aria-hidden="true" className={styles.collection}>
        <TournamentCollectionHeader />
        {Array.from({ length: 3 }).map((_, index) => (
          <div className={`${styles.columns} ${styles.row}`} key={index}>
            <div className={styles.sprites}><Skeleton className="h-10 w-16" /></div>
            <div className={styles.identity}>
              <Skeleton className="h-5 w-48 max-w-full" />
              <div className={styles.subtitle}><Skeleton className="h-4 w-56 max-w-full" /></div>
            </div>
            <div className={styles.metric}>
              <Skeleton className={`${styles.metricLabel} h-4 w-16`} />
              <Skeleton className="h-5 w-20" />
            </div>
            <div className={`${styles.metric} ${styles.record}`}>
              <Skeleton className={`${styles.metricLabel} h-4 w-12`} />
              <Skeleton className="h-5 w-10" />
            </div>
            <span className={styles.chevron} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TournamentsLoadingState() {
  return (
    <div className={styles.page} data-route-loading>
      <PageHeader
        action={<Skeleton aria-hidden="true" className="h-10 w-full sm:w-44" />}
        breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Tournaments" }]}
        title="Tournaments"
      />
      <TournamentsContentLoadingState />
    </div>
  );
}
