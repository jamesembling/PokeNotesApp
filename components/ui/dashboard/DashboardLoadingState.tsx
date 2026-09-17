import { Skeleton } from "@/components/shadcn/skeleton";
import { PageHeader } from "@/components/ui/PageHeader";
import styles from "./dashboard.module.css";

export function DashboardStatsLoading() {
  return (
    <section aria-label="Loading performance summary" className={styles.stats} role="status">
      <div className={styles.loadingHeading}><Skeleton className="h-5 w-44 rounded-none" /><Skeleton className="h-4 w-20 rounded-none" /></div>
      <div className={styles.statsGrid}>
        <Skeleton className="h-36 rounded-none" />
        <Skeleton className="h-36 rounded-none" />
        <Skeleton className="h-36 rounded-none" />
      </div>
    </section>
  );
}

export function DashboardActivityLoading() {
  return <DashboardSectionLoading label="Loading latest Battle Logs" rows={4} />;
}

export function DashboardTournamentsLoading() {
  return <DashboardSectionLoading label="Loading latest Tournaments" rows={3} />;
}

function DashboardSectionLoading({ label, rows }: { label: string; rows: number }) {
  return (
    <section aria-label={label} className={styles.activitySection} role="status">
      <div className={styles.loadingHeading}><Skeleton className="h-5 w-36 rounded-none" /><Skeleton className="h-4 w-16 rounded-none" /></div>
      <div className={styles.loadingRows}>
        {Array.from({ length: rows }, (_, index) => <Skeleton className="h-[4.5rem] rounded-none" key={index} />)}
      </div>
    </section>
  );
}

export function DashboardPageLoadingState() {
  return (
    <div aria-busy="true" aria-label="Loading Dashboard" className={styles.page} data-route-loading>
      <PageHeader
        breadcrumb={[{ label: "Poke Notes" }]}
        subtitle="Your recent play, results, and preparation in one place."
        title="Dashboard"
      />
      <div className={styles.overview}>
        <DashboardStatsLoading />
        <div className={styles.activityGrid}>
          <DashboardActivityLoading />
          <DashboardTournamentsLoading />
        </div>
      </div>
    </div>
  );
}
