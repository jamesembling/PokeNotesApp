import { Suspense } from "react";
import { AdminUsersTable } from "@/components/ui/AdminUsersTable";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getAdminDashboardOverview, getAdminUsers } from "@/lib/db/admin";

function formatDateTime(value: string | undefined) {
  if (!value) {
    return "Not available yet";
  }

  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
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
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card className="space-y-1">
        <p className="ui-eyebrow">Users</p>
        <p className="text-3xl font-semibold text-[var(--text-primary)]">{overview.userCount}</p>
        <p className="text-sm text-[var(--text-muted)]">{overview.adminCount} admin accounts</p>
      </Card>
      <Card className="space-y-1">
        <p className="ui-eyebrow">Pokemon Catalog</p>
        <p className="text-3xl font-semibold text-[var(--text-primary)]">
          {overview.pokemonCatalogCount}
        </p>
        <p className="text-sm text-[var(--text-muted)]">
          Synced {formatDateTime(overview.pokemonLastSyncedAt)}
        </p>
      </Card>
      <Card className="space-y-1">
        <p className="ui-eyebrow">Archetypes</p>
        <p className="text-3xl font-semibold text-[var(--text-primary)]">
          {overview.archetypeCatalogCount}
        </p>
        <p className="text-sm text-[var(--text-muted)]">
          Synced {formatDateTime(overview.archetypeLastSyncedAt)}
        </p>
      </Card>
      <Card className="space-y-1">
        <p className="ui-eyebrow">Excluded Archetypes</p>
        <p className="text-3xl font-semibold text-[var(--text-primary)]">
          {overview.excludedArchetypeCount}
        </p>
        <p className="text-sm text-[var(--text-muted)]">
          Hidden from automatic deck identification
        </p>
      </Card>
    </div>
  );
}

async function AdminUsersSection() {
  const { users, roleUpdatesEnabled, warning } = await getAdminUsers();

  return (
    <Card className="space-y-6">
      <div className="space-y-2">
        <p className="ui-eyebrow">User Management</p>
        <h2 className="ui-section-title">Accounts and Roles</h2>
        <p className="text-sm text-[var(--text-muted)]">
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
    </Card>
  );
}

function AdminSummaryCardsFallback() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card className="space-y-3" key={index}>
          <div className="h-3 w-24 animate-pulse rounded bg-[var(--bg-surface-alt)]" />
          <div className="h-9 w-16 animate-pulse rounded bg-[var(--bg-surface-alt)]" />
          <div className="h-4 w-40 animate-pulse rounded bg-[var(--bg-surface-alt)]" />
        </Card>
      ))}
    </div>
  );
}

function AdminUsersSectionFallback() {
  return (
    <Card className="space-y-6">
      <div className="space-y-2">
        <p className="ui-eyebrow">User Management</p>
        <h2 className="ui-section-title">Accounts and Roles</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Loading trainer accounts and role controls...
        </p>
      </div>

      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            className="h-20 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--bg-surface-alt)]"
            key={index}
          />
        ))}
      </div>
    </Card>
  );
}
