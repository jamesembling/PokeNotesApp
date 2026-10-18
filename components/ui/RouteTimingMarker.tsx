import { headers } from "next/headers";
import {
  PROXY_AUTH_DURATION_HEADER,
  PROXY_AUTH_ENDED_HEADER,
  PROXY_AUTH_METHOD_HEADER,
  PROXY_AUTH_REFRESHED_HEADER,
  PROXY_AUTH_STARTED_HEADER,
  REQUEST_CORRELATION_HEADER,
  REQUEST_STARTED_HEADER,
  takeServerRuntimeSnapshot
} from "@/lib/server/perf";

type RouteTimingMarkerProps = {
  durationMs: number;
  phase:
    | "admin-access"
    | "admin-overview"
    | "admin-users"
    | "proxy-auth"
    | "route-data"
    | "shell-profile";
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

export async function ProxyAuthTimingMarker({
  routeEnteredAtEpochMs
}: {
  routeEnteredAtEpochMs?: number;
}) {
  const requestHeaders = await headers();
  const durationMs = parseOptionalNumber(requestHeaders.get(PROXY_AUTH_DURATION_HEADER));
  const authStartedMs = parseOptionalNumber(requestHeaders.get(PROXY_AUTH_STARTED_HEADER));
  const authEndedMs = parseOptionalNumber(requestHeaders.get(PROXY_AUTH_ENDED_HEADER));
  const requestCorrelationId = requestHeaders.get(REQUEST_CORRELATION_HEADER);
  const requestStartedAt = parseOptionalNumber(requestHeaders.get(REQUEST_STARTED_HEADER));
  const requestId = requestHeaders.get("x-vercel-id");
  const authMethod = requestHeaders.get(PROXY_AUTH_METHOD_HEADER);
  const authRefreshed = requestHeaders.get(PROXY_AUTH_REFRESHED_HEADER);
  const runtime = takeServerRuntimeSnapshot();

  if (durationMs === null || durationMs < 0) {
    return null;
  }

  return (
    <>
      <RouteTimingMarker durationMs={durationMs} phase="proxy-auth" />
      <span
        aria-hidden="true"
        data-route-auth-ended-ms={safeOffset(authEndedMs)}
        data-route-auth-method={authMethod || undefined}
        data-route-auth-refreshed={
          authRefreshed === "1" ? "true" : authRefreshed === "0" ? "false" : undefined
        }
        data-route-auth-started-ms={safeOffset(authStartedMs)}
        data-route-request-correlation-id={requestCorrelationId || undefined}
        data-route-request-id={requestId || undefined}
        data-route-request-started-at={safeEpoch(requestStartedAt)}
        data-route-route-entered-ms={
          requestStartedAt === null || routeEnteredAtEpochMs === undefined
            ? undefined
            : safeOffset(routeEnteredAtEpochMs - requestStartedAt)
        }
        data-route-runtime-boot-age-ms={runtime.bootAgeMs}
        data-route-runtime-boot-id={runtime.bootId}
        data-route-runtime-invocation-ordinal={runtime.invocationOrdinal}
        data-route-runtime-region={process.env.VERCEL_REGION || process.env.VERCEL_FUNCTION_REGION}
        hidden
      />
    </>
  );
}

function safeDuration(value: number) {
  return Math.max(0, Math.min(600_000, Math.round(value)));
}

function safeOffset(value: number | null) {
  return value !== null && Number.isFinite(value) ? safeDuration(value) : undefined;
}

function safeEpoch(value: number | null) {
  return value !== null && Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
}

function parseOptionalNumber(value: string | null) {
  if (value === null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
