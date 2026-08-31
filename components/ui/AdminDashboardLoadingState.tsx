import { Skeleton } from "@/components/shadcn/skeleton";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import styles from "./admin/admin.module.css";

export function AdminDashboardLoadingState() {
  return (
    <div aria-busy="true" aria-label="Loading Admin Dashboard" className={styles.page} data-route-loading>
      <PageHeader
        breadcrumb={[
          { label: "Poke Notes", href: "/" },
          { label: "Admin" },
          { label: "Dashboard" }
        ]}
        title="Admin Dashboard"
        subtitle="Manage account access and monitor the imported catalog data that powers battle log identification."
      />
      <AdminSummaryCardsFallback />
      <AdminUsersSectionFallback />
    </div>
  );
}

export function AdminSummaryCardsFallback() {
  return (
    <div aria-hidden="true" className={styles.summary} data-route-loading>
      {["Users", "Pokémon Catalog", "Archetypes"].map((label) => (
        <div className={styles.summaryItem} key={label}>
          <p>{label}</p>
          <Skeleton className={styles.summaryValueSkeleton} />
          <Skeleton className={styles.summaryDetailSkeleton} />
        </div>
      ))}
    </div>
  );
}

export function AdminUsersSectionFallback() {
  return (
    <section className={styles.accounts} data-route-loading>
      <div className={styles.sectionIntro}>
        <SectionHeader title="Accounts and Roles" />
        <p className={styles.description}>Loading trainer accounts and role controls…</p>
      </div>
      <div aria-hidden="true" className={styles.loadingLedger}>
        {Array.from({ length: 4 }).map((_, index) => (
          <div className={styles.loadingRow} key={index}>
            <div><Skeleton className="h-5 w-36" /><Skeleton className="mt-2 h-4 w-48 max-w-full" /></div>
            <Skeleton className="h-4 w-28" />
            <div><Skeleton className="h-4 w-28" /><Skeleton className="mt-3 h-4 w-36 max-w-full" /></div>
            {Array.from({ length: 4 }).map((_, countIndex) => (
              <Skeleton className="h-4 w-8 justify-self-end" key={countIndex} />
            ))}
            <Skeleton className="h-6 w-20" />
          </div>
        ))}
      </div>
    </section>
  );
}
