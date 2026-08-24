import { Skeleton } from "@/components/shadcn/skeleton";
import { PageHeader } from "@/components/ui/PageHeader";

export function AdminDashboardLoadingState() {
  return (
    <div aria-busy="true" aria-label="Loading Admin Dashboard" data-route-loading>
      <div className="flex flex-col gap-6">
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
    </div>
  );
}

export function AdminSummaryCardsFallback() {
  return (
    <div className="grid gap-6 md:grid-cols-3" data-route-loading>
      {Array.from({ length: 3 }).map((_, index) => (
        <div className="py-2" key={index}>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-16" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AdminUsersSectionFallback() {
  return (
    <section className="flex flex-col gap-4 border-t border-border pt-6" data-route-loading>
      <div className="flex flex-col gap-1">
        <p className="ui-eyebrow">User Management</p>
        <h2 className="text-base font-semibold text-card-foreground">Accounts and Roles</h2>
        <p className="text-sm text-muted-foreground">Loading trainer accounts and role controls…</p>
      </div>

      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton className="h-20 rounded-none border-b border-border" key={index} />
        ))}
      </div>
    </section>
  );
}
