export const ROUTE_REPORTER_VERSION = 9;
export const APP_ROUTE_MIN_OBSERVATION_MS = 800;
export const APP_ROUTE_QUIET_WINDOW_MS = 200;
export const APP_ROUTE_MAX_OBSERVATION_MS = 1500;

const TRACKED_ROUTE_ROOTS = [
  "/admin",
  "/calculator",
  "/dashboard",
  "/deck-lists",
  "/decks",
  "/friends",
  "/logs",
  "/logs-canary",
  "/players",
  "/profile",
  "/replays",
  "/stats",
  "/tournaments"
] as const;

export function isTrackedPerformancePath(path: string) {
  const [pathname] = path.split(/[?#]/);

  return TRACKED_ROUTE_ROOTS.some(
    (routeRoot) => pathname === routeRoot || pathname.startsWith(`${routeRoot}/`)
  );
}

type NavigationReportDecisionInput = {
  candidateCompletedAt: number;
  observedAt: number;
  pathReadyAt: number;
  startedAt: number;
};

export function getNavigationReportDecision({
  candidateCompletedAt,
  observedAt,
  pathReadyAt,
  startedAt
}: NavigationReportDecisionInput) {
  const observedForMs = Math.max(0, observedAt - pathReadyAt);
  const quietForMs = Math.max(0, observedAt - candidateCompletedAt);
  const totalDurationMs = Math.max(0, observedAt - startedAt);
  const reachedMaximum = observedForMs >= APP_ROUTE_MAX_OBSERVATION_MS;
  const reachedStableWindow =
    observedForMs >= APP_ROUTE_MIN_OBSERVATION_MS && quietForMs >= APP_ROUTE_QUIET_WINDOW_MS;
  const shouldReport = reachedMaximum || reachedStableWindow;
  const remainingChecks = [
    APP_ROUTE_MAX_OBSERVATION_MS - observedForMs,
    APP_ROUTE_MIN_OBSERVATION_MS - observedForMs,
    APP_ROUTE_QUIET_WINDOW_MS - quietForMs
  ].filter((value) => value > 0);

  return {
    nextCheckMs: shouldReport ? 0 : Math.max(1, Math.min(...remainingChecks)),
    shouldReport,
    stabilizationMs: shouldReport
      ? Math.max(0, totalDurationMs - (candidateCompletedAt - startedAt))
      : null
  };
}

/** Marker timestamps use the document clock; each navigation has its own origin. */
export function routeTimingSince(timestamp: number | null, startedAt: number) {
  return timestamp !== null && timestamp >= startedAt
    ? Math.max(0, Math.round(timestamp - startedAt))
    : null;
}

export function getRouteDataTiming(args: {
  startedAt: number;
  measuredAt: number;
  paintedAt: number | null;
  parsedAt: number | null;
}) {
  const paintedMs = routeTimingSince(args.paintedAt, args.startedAt);
  const parsedMs = routeTimingSince(args.parsedAt, args.startedAt);
  return {
    durationMs: paintedMs ?? parsedMs ?? Math.max(0, Math.round(args.measuredAt - args.startedAt)),
    paintedMs,
    parsedMs
  };
}
