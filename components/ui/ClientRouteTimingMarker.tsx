"use client";

import { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export type ClientTimingPhase =
  | "route-content-visible"
  | "route-data-visible"
  | "route-shell-visible"
  | "shell-profile-loaded"
  | "shell-visible";

export function ClientRouteTimingMarker({ phase }: { phase: ClientTimingPhase }) {
  const pathname = usePathname();
  const markerRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const marker = markerRef.current;
    if (!marker) {
      return;
    }

    let cancelled = false;
    marker.dataset.routeClientPath = pathname;
    delete marker.dataset.routeClientPaintMs;
    marker.dataset.routeClientTimingMs = String(Math.max(0, Math.round(performance.now())));
    window.dispatchEvent(new CustomEvent("pokenotes:route-client-timing", { detail: { phase } }));

    let recorded = false;
    const recordPostPaint = () => {
      if (cancelled || recorded || !marker.isConnected) {
        return;
      }
      recorded = true;
      marker.dataset.routeClientPaintMs = String(Math.max(0, Math.round(performance.now())));
      window.dispatchEvent(new CustomEvent("pokenotes:route-client-paint", { detail: { phase } }));
    };

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        recordPostPaint();
      });
    });
    const timeout = window.setTimeout(recordPostPaint, 100);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [phase, pathname]);

  return <span aria-hidden="true" data-route-client-timing={phase} hidden ref={markerRef} />;
}
