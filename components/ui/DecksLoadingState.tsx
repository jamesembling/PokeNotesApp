import { Skeleton } from "@/components/shadcn/skeleton";
import styles from "@/components/ui/deck-strategy/collection.module.css";

export function DecksLoadingState() {
  return (
    <div
      aria-busy="true"
      className="flex flex-col gap-6"
      data-route-loading
      role="status"
    >
      <span className="sr-only">Loading deck strategy</span>
      <header aria-hidden="true" className="flex flex-col gap-4">
        <Skeleton className="h-4 w-40" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-[22rem] max-w-full" />
          </div>
          <Skeleton className="hidden h-10 w-32 rounded-lg sm:block" />
        </div>
      </header>
      <div aria-hidden="true" className={styles.collection}>
        <div className={styles.toolbar}>
          <div className="flex h-9 items-center gap-6">
            <Skeleton className="h-4 w-7" />
            <Skeleton className="h-4 w-8" />
          </div>
          <Skeleton className="h-10 w-28 rounded-lg sm:hidden" />
        </div>
        <div className={styles.list}>
          <div className={`${styles.listHeader} ${styles.columns} h-12`}>
            <Skeleton className="h-3 w-10" />
            <Skeleton className="mx-auto h-3 w-14" />
            <Skeleton className="mx-auto h-3 w-12" />
            <Skeleton className="mx-auto h-3 w-14" />
            <Skeleton className="ml-auto h-3 w-14" />
            <span />
          </div>
          {Array.from({ length: 6 }).map((_, index) => (
            <div className={`${styles.row} ${styles.columns}`} key={index}>
              <div className={styles.identity}>
                <Skeleton className="h-10 w-[82px] shrink-0" />
                <div className="min-w-0 space-y-2">
                  <Skeleton className="h-4 w-40 max-w-full" />
                  <Skeleton className="h-3 w-28 max-w-full" />
                </div>
              </div>
              <div className={styles.listWinRate}>
                <Skeleton className="mx-auto h-7 w-14" />
              </div>
              <div className={styles.listNumber}>
                <Skeleton className="mx-auto h-4 w-10" />
              </div>
              <div className={styles.listNumber}>
                <Skeleton className="mx-auto h-4 w-5" />
              </div>
              <div className={styles.updated}>
                <Skeleton className="ml-auto h-4 w-20" />
              </div>
              <Skeleton className="h-3 w-2 justify-self-end" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
