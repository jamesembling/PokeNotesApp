"use client";

import { useLayoutEffect, useRef } from "react";

export type ClientTimingPhase = "route-content-visible" | "shell-profile-loaded" | "shell-visible";

export function ClientRouteTimingMarker({ phase }: { phase: ClientTimingPhase }) {
  const markerRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const marker = markerRef.current;
    if (!marker) {
      return;
    }

    marker.dataset.routeClientTimingMs = String(Math.max(0, Math.round(performance.now())));
    window.dispatchEvent(new CustomEvent("pokenotes:route-client-timing", { detail: { phase } }));
  }, [phase]);

  return <span aria-hidden="true" data-route-client-timing={phase} hidden ref={markerRef} />;
}
