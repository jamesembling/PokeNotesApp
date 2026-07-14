import { headers } from "next/headers";
import { PROXY_AUTH_DURATION_HEADER } from "@/lib/server/perf";

type RouteTimingMarkerProps = {
  durationMs: number;
  phase: "proxy-auth" | "route-data" | "shell-profile";
};

export function RouteTimingMarker({ durationMs, phase }: RouteTimingMarkerProps) {
  const safeDuration = Math.max(0, Math.min(600_000, Math.round(durationMs)));

  return (
    <span
      aria-hidden="true"
      data-route-server-timing={phase}
      data-route-server-timing-ms={safeDuration}
      hidden
    />
  );
}

export async function ProxyAuthTimingMarker() {
  const requestHeaders = await headers();
  const durationMs = Number(requestHeaders.get(PROXY_AUTH_DURATION_HEADER));

  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return null;
  }

  return <RouteTimingMarker durationMs={durationMs} phase="proxy-auth" />;
}
