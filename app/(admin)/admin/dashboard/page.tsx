import { Suspense } from "react";
import { Skeleton } from "@/components/shadcn/skeleton";
import { AdminUsersTable } from "@/components/ui/AdminUsersTable";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/shadcn/card";
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
      <Card>
        <CardHeader>
          <p className="ui-eyebrow">Users</p>
          <CardTitle className="text-3xl">{overview.userCount}</CardTitle>
          <CardDescription>{overview.adminCount} admin accounts</CardDescription>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <p className="ui-eyebrow">Pokemon Catalog</p>
          <CardTitle className="text-3xl">{overview.pokemonCatalogCount}</CardTitle>
          <CardDescription>
            Synced {formatDateTime(overview.pokemonLastSyncedAt)}
          </CardDescription>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <p className="ui-eyebrow">Archetypes</p>
          <CardTitle className="text-3xl">{overview.archetypeCatalogCount}</CardTitle>
          <CardDescription>
            Synced {formatDateTime(overview.archetypeLastSyncedAt)}
          </CardDescription>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <p className="ui-eyebrow">Excluded Archetypes</p>
          <CardTitle className="text-3xl">{overview.excludedArchetypeCount}</CardTitle>
          <CardDescription>Hidden from automatic deck identification</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

async function AdminUsersSection() {
  const { users, roleUpdatesEnabled, warning } = await getAdminUsers();

  return (
    <Card>
      <CardHeader>
        <p className="ui-eyebrow">User Management</p>
        <CardTitle>Accounts and Roles</CardTitle>
        <CardDescription>
          Review trainer accounts, see recent activity, and change access levels.
          {roleUpdatesEnabled
            ? " Changes apply immediately."
            : " Role changes are currently disabled until the service role key is configured."}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <AdminUsersTable
          roleUpdatesEnabled={roleUpdatesEnabled}
          users={users}
          warning={warning}
        />
      </CardContent>
    </Card>
  );
}

function AdminSummaryCardsFallback() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index}>
          <CardHeader>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-16" />
            <Skeleton className="h-4 w-40" />
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

function AdminUsersSectionFallback() {
  return (
    <Card>
      <CardHeader>
        <p className="ui-eyebrow">User Management</p>
        <CardTitle>Accounts and Roles</CardTitle>
        <CardDescription>
          Loading trainer accounts and role controls...
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton className="h-20 rounded-xl border border-border" key={index} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
