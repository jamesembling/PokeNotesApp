"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { Button } from "@/components/shadcn/button";
import { ClientRouteTimingMarker } from "@/components/ui/ClientRouteTimingMarker";
import { ParserRouteTimingMarker } from "@/components/ui/ParserRouteTimingMarker";
import { LazyImportLogButton } from "@/components/ui/LazyImportLogButton";
import { PageActions } from "@/components/ui/PageActions";
import { PageHeader } from "@/components/ui/PageHeader";

let logsManagementMode = false;
const logsManagementModeListeners = new Set<() => void>();

function subscribeToLogsManagementMode(listener: () => void) {
  logsManagementModeListeners.add(listener);
  return () => logsManagementModeListeners.delete(listener);
}

function setLogsManagementMode(next: boolean) {
  if (logsManagementMode === next) {
    return;
  }

  logsManagementMode = next;
  logsManagementModeListeners.forEach((listener) => listener());
}

type LogsWorkspaceFrameProps = {
  children: ReactNode;
  isLoading?: boolean;
  performanceVariant: string;
  stats: ReactNode;
};

export function LogsWorkspaceFrame({
  children,
  isLoading = false,
  performanceVariant,
  stats
}: LogsWorkspaceFrameProps) {
  const { isManagementMode, toggleManagementMode } = useLogsManagementMode();

  useEffect(() => {
    setLogsManagementMode(false);
    return () => setLogsManagementMode(false);
  }, []);

  return (
    <div
      className="-mx-4 -my-6 flex min-h-dvh flex-col gap-6 bg-background px-4 py-6 text-foreground sm:-mx-6 sm:-my-8 sm:px-6 sm:py-8 lg:-mx-8 lg:px-8"
      data-route-performance-variant={performanceVariant}
    >
      <ParserRouteTimingMarker phase="route-shell-parsed" />
      <ClientRouteTimingMarker phase="route-shell-visible" />
      <PageHeader
        action={
          !isLoading ? <PageActions className="hidden sm:flex">
            <Button
              className="w-full justify-center sm:w-auto sm:self-start sm:min-w-[5.5rem]"
              onClick={toggleManagementMode}
            >
              {isManagementMode ? "Done" : "Edit logs"}
            </Button>
          </PageActions> : null
        }
        breadcrumb={[{ label: "Poke Notes", href: "/" }, { label: "Battle Logs" }]}
        meta={stats}
        title="Battle Logs"
      />

      {!isLoading ? (
        <PageActions className="sm:hidden" mobile="stack">
          <LazyImportLogButton className="w-full justify-center" />
        </PageActions>
      ) : null}

      {children}
    </div>
  );
}

export function useLogsManagementMode() {
  const isManagementMode = useSyncExternalStore(
    subscribeToLogsManagementMode,
    () => logsManagementMode,
    () => false
  );

  return {
    isManagementMode,
    toggleManagementMode: () => setLogsManagementMode(!logsManagementMode)
  };
}
