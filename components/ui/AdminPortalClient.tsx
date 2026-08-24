"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Button } from "@/components/shadcn/button";
import { AdminDashboardLoadingState } from "@/components/ui/AdminDashboardLoadingState";
import { AdminUsersTable } from "@/components/ui/AdminUsersTable";
import { AppShell } from "@/components/ui/AppShell";
import { ClientRouteTimingMarker } from "@/components/ui/ClientRouteTimingMarker";
import { PageHeader } from "@/components/ui/PageHeader";
import { SidebarAccount, SidebarAccountFallback } from "@/components/ui/Sidebar";
import type { AdminUser, AvatarColor, CatalogHealth } from "@/types/index";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short"
});

type AdminDashboardBootstrap = {
  diagnostics: {
    accessEndedMs: number;
    accessMs: number;
    accessStartedMs: number;
    overviewEndedMs: number;
    overviewMs: number;
    overviewStartedMs: number;
    runtimeBootAgeMs: number;
    runtimeBootId: string;
    runtimeInvocationOrdinal: number;
    runtimeRegion: string | null;
    usersEndedMs: number;
    usersMs: number;
    usersStartedMs: number;
  };
  overview: CatalogHealth & {
    adminCount: number;
    userCount: number;
  };
  profile: {
    avatarColor: AvatarColor;
    displayName: string;
    email: string;
    isAdmin: true;
  };
  users: {
    roleUpdatesEnabled: boolean;
    users: AdminUser[];
    warning?: string;
  };
};

type BootstrapState =
  | { status: "loading" }
  | { message: string; status: "error" }
  | { payload: AdminDashboardBootstrap; status: "ready" };

export function AdminPortalClient() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<BootstrapState>({ status: "loading" });
  const startedAttemptRef = useRef(-1);

  useEffect(() => {
    if (startedAttemptRef.current === attempt) {
      return;
    }

    startedAttemptRef.current = attempt;
    setState({ status: "loading" });

    void fetch("/api/admin/dashboard/bootstrap", {
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Accept: "application/json"
      }
    })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.replace("/login");
          return null;
        }

        if (response.status === 403) {
          window.location.replace("/logs");
          return null;
        }

        if (!response.ok) {
          throw new Error("The admin dashboard could not be loaded.");
        }

        return (await response.json()) as AdminDashboardBootstrap;
      })
      .then((payload) => {
        if (payload) {
          setState({ payload, status: "ready" });
        }
      })
      .catch((error: Error) => {
        setState({
          message: error.message || "The admin dashboard could not be loaded.",
          status: "error"
        });
      });
  }, [attempt]);

  useEffect(() => {
    function refreshDashboard() {
      setAttempt((current) => current + 1);
    }

    window.addEventListener("pokenotes:admin-dashboard-refresh", refreshDashboard);
    return () =>
      window.removeEventListener("pokenotes:admin-dashboard-refresh", refreshDashboard);
  }, []);

  const account =
    state.status === "ready" ? (
      <>
        <SidebarAccount profile={state.payload.profile} />
        <ServerTimingMarker durationMs={state.payload.diagnostics.accessMs} phase="shell-profile" />
        <ClientRouteTimingMarker phase="shell-profile-loaded" />
      </>
    ) : (
      <SidebarAccountFallback />
    );

  return (
    <AppShell account={account}>
      <span data-route-performance-variant="admin-public-shell" hidden />
      <ClientRouteTimingMarker phase="route-shell-visible" />
      {state.status === "loading" ? <AdminDashboardLoadingState /> : null}
      {state.status === "error" ? (
        <AdminDashboardError
          message={state.message}
          onRetry={() => setAttempt((current) => current + 1)}
        />
      ) : null}
      {state.status === "ready" ? <AdminDashboardContent payload={state.payload} /> : null}
    </AppShell>
  );
}

function AdminDashboardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      <AdminDashboardHeader />
      <Alert variant="destructive">
        <AlertDescription>{message}</AlertDescription>
      </Alert>
      <div>
        <Button onClick={onRetry}>Try Again</Button>
      </div>
    </div>
  );
}

function AdminDashboardContent({ payload }: { payload: AdminDashboardBootstrap }) {
  const { diagnostics, overview, users } = payload;

  return (
    <div className="flex flex-col gap-6">
      <AdminDashboardHeader />
      <ServerTimingMarker durationMs={diagnostics.accessMs} phase="admin-access" />
      <ServerTimingMarker durationMs={diagnostics.overviewMs} phase="admin-overview" />
      <ServerTimingMarker durationMs={diagnostics.usersMs} phase="admin-users" />
      <span
        aria-hidden="true"
        data-route-data-ended-ms={Math.max(diagnostics.overviewEndedMs, diagnostics.usersEndedMs)}
        data-route-data-started-ms={Math.min(
          diagnostics.overviewStartedMs,
          diagnostics.usersStartedMs
        )}
        data-route-runtime-boot-age-ms={diagnostics.runtimeBootAgeMs}
        data-route-runtime-boot-id={diagnostics.runtimeBootId}
        data-route-runtime-invocation-ordinal={diagnostics.runtimeInvocationOrdinal}
        data-route-runtime-region={diagnostics.runtimeRegion ?? undefined}
        hidden
      />

      <div className="grid gap-6 md:grid-cols-3">
        <div className="py-2">
          <div className="flex flex-col gap-2">
            <p className="ui-eyebrow">Users</p>
            <p className="text-3xl font-semibold tracking-[-0.02em] text-card-foreground">
              {overview.userCount}
            </p>
            <p className="text-sm text-muted-foreground">
              {overview.adminCount} admin accounts
            </p>
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

      <section className="flex flex-col gap-4 border-t border-border pt-6">
        <div className="flex flex-col gap-1">
          <p className="ui-eyebrow">User Management</p>
          <h2 className="text-base font-semibold text-card-foreground">Accounts and Roles</h2>
          <p className="text-sm text-muted-foreground">
            Review trainer accounts, see recent activity, and change access levels.
            {users.roleUpdatesEnabled
              ? " Changes apply immediately."
              : " Role changes are currently disabled until the service role key is configured."}
          </p>
        </div>

        <AdminUsersTable
          roleUpdatesEnabled={users.roleUpdatesEnabled}
          users={users.users}
          warning={users.warning}
        />
      </section>

      <ClientRouteTimingMarker phase="route-content-visible" />
      <ClientRouteTimingMarker phase="route-data-visible" />
    </div>
  );
}

function AdminDashboardHeader() {
  return (
    <PageHeader
      breadcrumb={[
        { label: "Poke Notes", href: "/" },
        { label: "Admin" },
        { label: "Dashboard" }
      ]}
      title="Admin Dashboard"
      subtitle="Manage account access and monitor the imported catalog data that powers battle log identification."
    />
  );
}

function ServerTimingMarker({
  durationMs,
  phase
}: {
  durationMs: number;
  phase: "admin-access" | "admin-overview" | "admin-users" | "shell-profile";
}) {
  return (
    <span
      aria-hidden="true"
      data-route-server-timing={phase}
      data-route-server-timing-ms={Math.max(0, Math.min(600_000, Math.round(durationMs)))}
      hidden
    />
  );
}

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
