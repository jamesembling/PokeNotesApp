import { AdminUsersTable } from "@/components/ui/AdminUsersTable";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getAdminUsers, getCatalogHealth } from "@/lib/db/admin";

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
  const [{ users, roleUpdatesEnabled, warning }, catalogHealth] = await Promise.all([
    getAdminUsers(),
    getCatalogHealth()
  ]);
  const adminCount = users.filter((user) => user.role === "admin").length;

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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="space-y-1">
          <p className="ui-eyebrow">Users</p>
          <p className="text-3xl font-semibold text-[var(--text-primary)]">{users.length}</p>
          <p className="text-sm text-[var(--text-muted)]">{adminCount} admin accounts</p>
        </Card>
        <Card className="space-y-1">
          <p className="ui-eyebrow">Pokemon Catalog</p>
          <p className="text-3xl font-semibold text-[var(--text-primary)]">
            {catalogHealth.pokemonCatalogCount}
          </p>
          <p className="text-sm text-[var(--text-muted)]">
            Synced {formatDateTime(catalogHealth.pokemonLastSyncedAt)}
          </p>
        </Card>
        <Card className="space-y-1">
          <p className="ui-eyebrow">Archetypes</p>
          <p className="text-3xl font-semibold text-[var(--text-primary)]">
            {catalogHealth.archetypeCatalogCount}
          </p>
          <p className="text-sm text-[var(--text-muted)]">
            Synced {formatDateTime(catalogHealth.archetypeLastSyncedAt)}
          </p>
        </Card>
        <Card className="space-y-1">
          <p className="ui-eyebrow">Excluded Archetypes</p>
          <p className="text-3xl font-semibold text-[var(--text-primary)]">
            {catalogHealth.excludedArchetypeCount}
          </p>
          <p className="text-sm text-[var(--text-muted)]">
            Hidden from automatic deck identification
          </p>
        </Card>
      </div>

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
    </>
  );
}
