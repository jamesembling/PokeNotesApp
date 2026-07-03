import { Suspense } from "react";
import { Skeleton } from "@/components/shadcn/skeleton";
import { AdminUsersTable } from "@/components/ui/AdminUsersTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { getAdminDashboardOverview, getAdminUsers } from "@/lib/db/admin";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short"
});

function formatDateTime(value: string | undefined) {
  if (!value) {
    return "Not available yet";
  }

  try {
    return DATE_TIME_FORMATTER.format(new Date(value));
  } catch {
    return value;
  }
}

export default async function AdminDashboardPage() {
  const dashboardOverviewPromise = getAdminDashboardOverview();

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Poke Notes", href: "/" },
          { label: "Admin" },
          { label: "Dashboard" }
        ]}
        showDivider={false}
        title="Admin Dashboard"
        subtitle="Manage account access and monitor the imported catalog data that powers battle log identification."
      />

      <Suspense fallback={<AdminSummaryCardsFallback />}>
        <AdminSummaryCards dashboardOverviewPromise={dashboardOverviewPromise} />
      </Suspense>

      <Suspense fallback={<AdminUsersSectionFallback />}>
        <AdminUsersSection />
      </Suspense>
    </>
  );
}

async function AdminSummaryCards({
  dashboardOverviewPromise
}: {
  dashboardOverviewPromise: ReturnType<typeof getAdminDashboardOverview>;
}) {
  const overview = await dashboardOverviewPromise;

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <div className="py-2">
        <div className="flex flex-col gap-2">
          <p className="ui-eyebrow">Users</p>
          <p className="text-3xl font-semibold tracking-[-0.02em] text-card-foreground">
            {overview.userCount}
          </p>
          <p className="text-sm text-muted-foreground">{overview.adminCount} admin accounts</p>
        </div>
      </div>
      <div className="py-2">
        <div className="flex flex-col gap-2">
          <p className="ui-eyebrow">Pokemon Catalog</p>
          <p className="text-3xl font-semibold tracking-[-0.02em] text-card-foreground">
            {overview.pokemonCatalogCount}
          </p>
          <p className="text-sm text-muted-foreground">
            Synced {formatDateTime(overview.pokemonLastSyncedAt)}
          </p>
        </div>
      </div>
      <div className="py-2">
        <div className="flex flex-col gap-2">
          <p className="ui-eyebrow">Archetypes</p>
          <p className="text-3xl font-semibold tracking-[-0.02em] text-card-foreground">
            {overview.archetypeCatalogCount}
          </p>
          <p className="text-sm text-muted-foreground">
            Synced {formatDateTime(overview.archetypeLastSyncedAt)}
          </p>
        </div>
      </div>
    </div>
  );
}

async function AdminUsersSection() {
  const { users, roleUpdatesEnabled, warning } = await getAdminUsers();

  return (
    <section className="flex flex-col gap-4 border-t border-border pt-6">
      <div className="flex flex-col gap-1">
        <p className="ui-eyebrow">User Management</p>
        <h2 className="text-base font-semibold text-card-foreground">Accounts and Roles</h2>
        <p className="text-sm text-muted-foreground">
          Review trainer accounts, see recent activity, and change access levels.
          {roleUpdatesEnabled
            ? " Changes apply immediately."
            : " Role changes are currently disabled until the service role key is configured."}
        </p>
      </div>

      <AdminUsersTable
        roleUpdatesEnabled={roleUpdatesEnabled}
        users={users}
        warning={warning}
      />
    </section>
  );
}

function AdminSummaryCardsFallback() {
  return (
    <div className="grid gap-6 md:grid-cols-3">
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

function AdminUsersSectionFallback() {
  return (
    <section className="flex flex-col gap-4 border-t border-border pt-6">
      <div className="flex flex-col gap-1">
        <p className="ui-eyebrow">User Management</p>
        <h2 className="text-base font-semibold text-card-foreground">Accounts and Roles</h2>
        <p className="text-sm text-muted-foreground">
          Loading trainer accounts and role controls…
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton className="h-20 rounded-none border-b border-border" key={index} />
        ))}
      </div>
    </section>
  );
}
