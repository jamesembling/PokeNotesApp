"use client";

import { useLayoutEffect, useRef } from "react";

export type ClientTimingPhase =
  | "route-content-visible"
  | "route-data-visible"
  | "route-shell-visible"
  | "shell-profile-loaded"
  | "shell-visible";

export function ClientRouteTimingMarker({ phase }: { phase: ClientTimingPhase }) {
  const markerRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const marker = markerRef.current;
    if (!marker) {
      return;
    }

    marker.dataset.routeClientTimingMs = String(Math.max(0, Math.round(performance.now())));
    window.dispatchEvent(new CustomEvent("pokenotes:route-client-timing", { detail: { phase } }));

    let recorded = false;
    const recordPostPaint = () => {
      if (recorded || !marker.isConnected) {
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
    window.setTimeout(recordPostPaint, 100);
  }, [phase]);

  return <span aria-hidden="true" data-route-client-timing={phase} hidden ref={markerRef} />;
}
