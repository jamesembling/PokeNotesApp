"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { ClientRouteTimingMarker } from "@/components/ui/ClientRouteTimingMarker";
import { LogsLastKnownContent, LogsLastKnownStats } from "@/components/ui/LogsLastKnownState";
import { LogsStats } from "@/components/ui/LogsStats";
import { LogsWorkspaceClient } from "@/components/ui/LogsWorkspaceClient";
import { LogsWorkspaceFrame } from "@/components/ui/LogsWorkspaceFrame";
import { LogsStatsSkeleton } from "@/components/ui/LogsWorkspaceSkeleton";
import type { BattleLogSummary } from "@/types/index";
import { loadMoreLogsAction } from "@/app/(app)/logs/actions";
import { LogsRefreshContext } from "@/components/ui/LogsRefreshContext";
import { refreshLoadedLogsWindow } from "@/lib/client/logs-refresh";
import { loadLogsBootstrap } from "@/lib/client/logs-bootstrap";

type BootstrapDiagnostics = {
  authEndedMs: number;
  authMethod: string;
  authMs: number;
  authRefreshed: boolean;
  authStartedMs: number;
  cacheKeyVersion: string;
  cacheLookupMs: number;
  cacheOutcome: string;
  dataEndedMs: number;
  dataMs: number;
  dataStartedMs: number;
  mappingMs: number | null;
  requestCorrelationId: string;
  requestId: string | null;
  requestTimeline: Record<string, boolean | number | string | null>;
  resultBytes: number | null;
  resultRows: number | null;
  runtimeBootAgeMs: number;
  runtimeBootId: string;
  runtimeInvocationOrdinal: number;
  runtimeRegion: string | null;
  supabaseMs: number | null;
};

type BootstrapPayload = {
  diagnostics: BootstrapDiagnostics;
  stats: {
    losses: number;
    total: number;
    wins: number;
  };
  window: {
    hasMore: boolean;
    logs: BattleLogSummary[];
    nextWindowEndDate: string;
    windowEndDate: string;
    windowStartDate: string;
  };
};

type BootstrapState =
  | { status: "loading" }
  | { message: string; status: "error"; unauthorized: boolean }
  | { parsedAtMs: number; payload: BootstrapPayload; status: "ready" };

type LogsBootstrapClientProps = {
  performanceVariant: "logs-public-shell" | "logs-public-shell-canary";
};

export function LogsBootstrapClient({ performanceVariant }: LogsBootstrapClientProps) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<BootstrapState>({ status: "loading" });
  const startedAttemptRef = useRef(-1);
  const oldestLoadedLogRef = useRef<BattleLogSummary | null>(null);
  const [refreshError, setRefreshError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const result = await loadLogsBootstrap(false);
      if (!result.ok) {
        if (result.status === 401) window.location.replace("/login");
        throw new Error(
          "Your change was saved, but battle logs could not be refreshed. Try again."
        );
      }
      const payload = result.payload as BootstrapPayload;
      const refreshedWindow = await refreshLoadedLogsWindow(
        payload.window,
        oldestLoadedLogRef.current,
        loadMoreLogsAction
      );
      setState({
        parsedAtMs: result.parsedAtMs,
        payload: { ...payload, window: refreshedWindow },
        status: "ready"
      });
      setRefreshError("");
    } catch (error) {
      setRefreshError(
        error instanceof Error ? error.message : "Battle logs could not be refreshed."
      );
      throw error;
    }
  }, []);
  const trackLoadedWindow = useCallback((oldestLog: BattleLogSummary | null) => {
    oldestLoadedLogRef.current = oldestLog;
  }, []);

  useLayoutEffect(() => {
    delete document.documentElement.dataset.logsBootstrapSettled;
  }, []);

  useEffect(() => {
    if (startedAttemptRef.current === attempt) {
      return;
    }

    startedAttemptRef.current = attempt;
    setState({ status: "loading" });

    void loadLogsBootstrap(attempt === 0)
      .then((result) => {
        if (!result.ok) {
          const unauthorized = result.status === 401;
          throw Object.assign(
            new Error(
              unauthorized
                ? "Your session has expired. Sign in again to continue."
                : "Your battle logs could not be loaded."
            ),
            { unauthorized }
          );
        }

        return {
          parsedAtMs: result.parsedAtMs,
          payload: result.payload as BootstrapPayload
        };
      })
      .then(({ parsedAtMs, payload }) => {
        setState({ parsedAtMs, payload, status: "ready" });
      })
      .catch((error: Error & { unauthorized?: boolean }) => {
        const unauthorized = error.unauthorized === true;
        setState({
          message: error.message || "Your battle logs could not be loaded.",
          status: "error",
          unauthorized
        });

        if (unauthorized) {
          window.location.replace("/login");
        }
      });
  }, [attempt]);

  // Announce settlement only after React commits the result, so listeners can
  // read the rendered timing markers. Failures settle too: the sidebar and the
  // hard-load reporter must not wait forever on an errored bootstrap.
  useEffect(() => {
    if (state.status === "loading") {
      return;
    }

    document.documentElement.dataset.logsBootstrapSettled = "true";
    window.dispatchEvent(new CustomEvent("pokenotes:logs-bootstrap-settled"));
  }, [state.status]);

  const stats =
    state.status === "ready" ? (
      <LogsStats
        losses={state.payload.stats.losses}
        total={state.payload.stats.total}
        wins={state.payload.stats.wins}
      />
    ) : state.status === "loading" ? (
      <LogsLastKnownStats />
    ) : (
      <LogsStatsSkeleton />
    );

  return (
    <LogsRefreshContext.Provider value={refresh}>
      <LogsWorkspaceFrame
        isLoading={state.status !== "ready"}
        performanceVariant={performanceVariant}
        stats={stats}
      >
        {refreshError ? (
          <Alert variant="destructive">
            <AlertDescription>
              {refreshError}{" "}
              <Button variant="outline" onClick={() => void refresh().catch(() => undefined)}>
                Refresh logs
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        {state.status === "loading" ? <LogsLastKnownContent /> : null}
        {state.status === "error" ? (
          <Card className="gap-4">
            <Alert variant="destructive">
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-3">
              {state.unauthorized ? (
                <Button asChild>
                  <a href="/login">Sign in</a>
                </Button>
              ) : (
                <Button onClick={() => setAttempt((current) => current + 1)}>Try again</Button>
              )}
            </div>
          </Card>
        ) : null}
        {state.status === "ready" ? (
          <>
            <BootstrapTimingMarkers
              diagnostics={state.payload.diagnostics}
              parsedAtMs={state.parsedAtMs}
            />
            <LogsWorkspaceClient
              stats={state.payload.stats}
              window={state.payload.window}
              onLoadedWindowChange={trackLoadedWindow}
            />
            <ClientRouteTimingMarker phase="route-content-visible" />
            <ClientRouteTimingMarker phase="route-data-visible" />
          </>
        ) : null}
      </LogsWorkspaceFrame>
    </LogsRefreshContext.Provider>
  );
}

function BootstrapTimingMarkers({
  diagnostics,
  parsedAtMs
}: {
  diagnostics: BootstrapDiagnostics;
  parsedAtMs: number;
}) {
  return (
    <>
      <span
        aria-hidden="true"
        data-route-auth-ended-ms={diagnostics.authEndedMs}
        data-route-auth-method={diagnostics.authMethod}
        data-route-auth-refreshed={String(diagnostics.authRefreshed)}
        data-route-auth-started-ms={diagnostics.authStartedMs}
        data-route-bootstrap-timeline={JSON.stringify(diagnostics.requestTimeline)}
        data-route-request-correlation-id={diagnostics.requestCorrelationId}
        data-route-request-id={diagnostics.requestId ?? undefined}
        data-route-runtime-boot-age-ms={diagnostics.runtimeBootAgeMs}
        data-route-runtime-boot-id={diagnostics.runtimeBootId}
        data-route-runtime-invocation-ordinal={diagnostics.runtimeInvocationOrdinal}
        data-route-runtime-region={diagnostics.runtimeRegion ?? undefined}
        hidden
      />
      <span
        aria-hidden="true"
        data-route-server-timing="bootstrap-auth"
        data-route-server-timing-ms={diagnostics.authMs}
        hidden
      />
      <span
        aria-hidden="true"
        data-route-cache-key-version={diagnostics.cacheKeyVersion}
        data-route-cache-lookup-ms={diagnostics.cacheLookupMs}
        data-route-cache-outcome={diagnostics.cacheOutcome}
        data-route-data-ended-ms={diagnostics.dataEndedMs}
        data-route-data-started-ms={diagnostics.dataStartedMs}
        data-route-mapping-ms={diagnostics.mappingMs ?? undefined}
        data-route-result-bytes={diagnostics.resultBytes ?? undefined}
        data-route-result-rows={diagnostics.resultRows ?? undefined}
        data-route-server-timing="route-data"
        data-route-server-timing-ms={diagnostics.dataMs}
        data-route-supabase-ms={diagnostics.supabaseMs ?? undefined}
        hidden
      />
      <span
        aria-hidden="true"
        data-route-parser-timing="route-data-parsed"
        data-route-parser-timing-ms={parsedAtMs}
        hidden
      />
    </>
  );
}
