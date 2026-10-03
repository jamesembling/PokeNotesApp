import { Skeleton } from "@/components/shadcn/skeleton";
import { PageHeader } from "@/components/ui/PageHeader";
import styles from "./account/profile.module.css";

export function ProfileLoadingState() {
  return (
    <div aria-busy="true" className={styles.page} data-route-loading role="status">
      <span className="sr-only">Loading profile</span>
      <PageHeader breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Profile" }]} variant="collection" />
      <div aria-hidden="true">
        <div className={styles.hero}>
          <Skeleton className={`${styles.heroAvatar} shrink-0 rounded-full`} />
          <div className="min-w-0 space-y-4"><Skeleton className="h-10 w-60 max-w-full" /><Skeleton className="h-4 w-36" /><Skeleton className="h-4 w-32" /></div>
        </div>
        <div className={styles.account}>
          {["account", "activity"].map((section) => <div key={section}>
            <Skeleton className="h-6 w-24" />
            <div className="mt-5 space-y-6">{Array.from({ length: 3 }, (_, index) => <Skeleton className="h-4 w-full" key={index} />)}</div>
          </div>)}
        </div>
        <div className={`${styles.editor} flex h-16 items-center`}><Skeleton className="h-4 w-40" /></div>
        <div className="border-t pt-8">
          <Skeleton className="h-6 w-40" /><Skeleton className="mt-3 h-4 w-full max-w-md" />
          <div className="mt-6 space-y-6"><Skeleton className="h-11 w-full max-w-md" /><Skeleton className="h-5 w-60 max-w-full" /><Skeleton className="h-11 w-full max-w-md" /></div>
        </div>
      </div>
    </div>
  );
}
