import { Suspense } from "react";
import {
  AdminSummaryCardsFallback,
  AdminUsersSectionFallback
} from "@/components/ui/AdminDashboardLoadingState";
import { AdminUsersTable } from "@/components/ui/AdminUsersTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { RouteTimingMarker } from "@/components/ui/RouteTimingMarker";
import { getAdminDashboardOverview, getAdminUsers } from "@/lib/db/admin";
import { measureServerCallWithTiming } from "@/lib/server/perf";

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
  const dashboardOverviewPromise = measureServerCallWithTiming(
    "page.admin.dashboard.overview",
    () => getAdminDashboardOverview()
  );

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Poke Notes", href: "/" },
          { label: "Admin" },
          { label: "Dashboard" }
        ]}
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
  dashboardOverviewPromise: Promise<{
    durationMs: number;
    value: Awaited<ReturnType<typeof getAdminDashboardOverview>>;
  }>;
}) {
  const overviewTiming = await dashboardOverviewPromise;
  const overview = overviewTiming.value;

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <RouteTimingMarker durationMs={overviewTiming.durationMs} phase="admin-overview" />
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
  const usersTiming = await measureServerCallWithTiming("page.admin.dashboard.users", () =>
    getAdminUsers()
  );
  const { users, roleUpdatesEnabled, warning } = usersTiming.value;

  return (
    <section className="flex flex-col gap-4 border-t border-border pt-6">
      <RouteTimingMarker durationMs={usersTiming.durationMs} phase="admin-users" />
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
