import { Skeleton } from "@/components/shadcn/skeleton";
import { DeckListCollectionHeader } from "@/components/ui/DeckListCollection";
import { PageHeader } from "@/components/ui/PageHeader";
import styles from "./deck-list/collection.module.css";

export function DeckListsLoadingState() {
  return (
    <div aria-busy="true" className={styles.page} data-route-loading role="status">
      <span className="sr-only">Loading Deck Lists</span>
      <PageHeader
        action={<Skeleton aria-hidden="true" className="h-10 w-36" />}
        breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Deck Lists" }]}
        meta={<Skeleton aria-hidden="true" className="h-5 w-12" />}
        variant="collection"
        title="Deck Lists"
      />
      <div aria-hidden="true" className={styles.collection}>
        <DeckListCollectionHeader />
        {Array.from({ length: 6 }).map((_, index) => (
          <div className={`${styles.columns} ${styles.row}`} key={index}>
            <div className={styles.identity}>
              <Skeleton className="h-5 w-48 max-w-full" />
              <div className={styles.compactMeta}><Skeleton className="h-4 w-52 max-w-full" /></div>
            </div>
            <div className={styles.format}><Skeleton className="mx-auto h-4 w-16" /></div>
            {Array.from({ length: 3 }).map((_, metricIndex) => (
              <div className={`${styles.metric} ${styles.loadingMetric}`} key={metricIndex}>
                <Skeleton className={`${styles.metricLabel} h-4 w-16`} />
                <Skeleton className="h-5 w-10" />
              </div>
            ))}
            <div className={styles.updated}><Skeleton className="ml-auto h-4 w-20" /></div>
            <span className={styles.chevron} />
          </div>
        ))}
      </div>
    </div>
  );
}
