import { Skeleton } from "@/components/shadcn/skeleton";
import { PageHeader } from "@/components/ui/PageHeader";
import styles from "./account/profile.module.css";

export function ProfileLoadingState() {
  return (
    <div aria-busy="true" className={styles.page} data-route-loading role="status">
      <span className="sr-only">Loading profile</span>
      <PageHeader
        breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Profile" }]}
        title="Profile"
      />
      <div aria-hidden="true" className={styles.layout}>
        <div className={styles.form}>
          <Skeleton className="h-6 w-36" />
          <Skeleton className="mt-3 h-4 w-full max-w-md" />
          <div className={styles.fields}>
            {Array.from({ length: 4 }, (_, index) => (
              <div className="space-y-3" key={index}>
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-11 w-full" />
              </div>
            ))}
          </div>
          <div className={styles.saveRow}><span /><Skeleton className="h-10 w-28" /></div>
          <div className={styles.avatarSection}>
            <Skeleton className="h-6 w-36" />
            <Skeleton className="mt-3 h-4 w-full max-w-sm" />
            <div className={styles.avatarChoices}>
              {Array.from({ length: 8 }, (_, index) => (
                <div className="flex flex-col items-center gap-3" key={index}>
                  <Skeleton className="size-10 rounded-full" />
                  <Skeleton className="h-3 w-8" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className={styles.account}>
          {["account", "activity"].map((section) => (
            <div className={section === "activity" ? styles.activity : undefined} key={section}>
              <Skeleton className="h-6 w-24" />
              <div className="mt-6 space-y-6">
                {Array.from({ length: 3 }, (_, index) => <Skeleton className="h-4 w-full" key={index} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
