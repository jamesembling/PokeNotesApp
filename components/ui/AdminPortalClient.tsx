"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/shadcn/button";
import { AdminDashboardLoadingState } from "@/components/ui/AdminDashboardLoadingState";
import { AdminUsersTable } from "@/components/ui/AdminUsersTable";
import { AppShell } from "@/components/ui/AppShell";
import { ClientRouteTimingMarker } from "@/components/ui/ClientRouteTimingMarker";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SidebarAccount, SidebarAccountFallback } from "@/components/ui/Sidebar";
import { SectionTitle } from "@/components/ui/Typography";
import type { AdminUser, AvatarColor, CatalogHealth } from "@/types/index";
import styles from "./admin/admin.module.css";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short"
});
const COUNT_FORMATTER = new Intl.NumberFormat("en-GB");

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
    avatarUrl?: string | null;
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
    <div className={styles.page}>
      <AdminDashboardHeader />
      <section aria-labelledby="admin-error-title" className={styles.error}>
        <SectionTitle id="admin-error-title" size="sm">Dashboard unavailable</SectionTitle>
        <p className={styles.errorMessage} role="alert">{message}</p>
        <div><Button onClick={onRetry} variant="outline">Try Again</Button></div>
      </section>
    </div>
  );
}

function AdminDashboardContent({ payload }: { payload: AdminDashboardBootstrap }) {
  const { diagnostics, overview, users } = payload;

  return (
    <div className={styles.page}>
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

      <section aria-label="Admin overview">
        <dl className={styles.summary}>
          <div className={styles.summaryItem}>
            <dt>Users</dt>
            <dd className={styles.summaryValue}>{COUNT_FORMATTER.format(overview.userCount)}</dd>
            <dd className={styles.summaryDetail}>
              {COUNT_FORMATTER.format(overview.adminCount)} admin {overview.adminCount === 1 ? "account" : "accounts"}
            </dd>
          </div>
          <div className={styles.summaryItem}>
            <dt>Pokémon Catalog</dt>
            <dd className={styles.summaryValue}>{COUNT_FORMATTER.format(overview.pokemonCatalogCount)}</dd>
            <dd className={styles.summaryDetail}>
              Synced {formatDateTime(overview.pokemonLastSyncedAt)}
            </dd>
          </div>
          <div className={styles.summaryItem}>
            <dt>Archetypes</dt>
            <dd className={styles.summaryValue}>{COUNT_FORMATTER.format(overview.archetypeCatalogCount)}</dd>
            <dd className={styles.summaryDetail}>
              Synced {formatDateTime(overview.archetypeLastSyncedAt)}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="admin-users-title" className={styles.accounts}>
        <div className={styles.sectionIntro}>
          <SectionHeader title="Accounts and Roles" titleId="admin-users-title" />
          <p className={styles.description}>
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
