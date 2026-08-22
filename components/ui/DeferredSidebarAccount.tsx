"use client";

import { useEffect, useRef, useState } from "react";
import { useSidebar } from "@/components/shadcn/sidebar";
import { ClientRouteTimingMarker } from "@/components/ui/ClientRouteTimingMarker";
import { SidebarAccount, SidebarAccountFallback } from "@/components/ui/Sidebar";
import { shouldLoadSidebarProfile } from "@/lib/sidebar-profile-loading";
import type { AppShellProfileResult } from "@/components/ui/AppShell";

export function DeferredSidebarAccount({
  initialResult
}: {
  initialResult?: AppShellProfileResult;
}) {
  const { openMobile } = useSidebar();
  const [result, setResult] = useState<AppShellProfileResult | null>(initialResult ?? null);
  const startedRef = useRef(Boolean(initialResult));

  useEffect(() => {
    const shouldLoad = shouldLoadSidebarProfile({
      isDesktop: window.matchMedia("(min-width: 860px)").matches,
      openMobile
    });

    if (!shouldLoad || startedRef.current) {
      return;
    }

    startedRef.current = true;

    void fetch("/api/sidebar-profile", {
      cache: "no-store",
      credentials: "same-origin"
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Unable to load sidebar profile.");
        }

        return (await response.json()) as AppShellProfileResult;
      })
      .then(setResult)
      .catch(() => {
        startedRef.current = false;
      });
  }, [openMobile]);

  if (!result) {
    return <SidebarAccountFallback />;
  }

  return (
    <>
      <SidebarAccount profile={result.profile} />
      <span
        aria-hidden="true"
        data-route-server-timing="shell-profile"
        data-route-server-timing-ms={Math.max(0, Math.min(600_000, Math.round(result.durationMs)))}
        hidden
      />
      <ClientRouteTimingMarker phase="shell-profile-loaded" />
    </>
  );
}
