export const ROUTE_REPORTER_VERSION = 6;
export const APP_ROUTE_MIN_OBSERVATION_MS = 800;
export const APP_ROUTE_QUIET_WINDOW_MS = 200;
export const APP_ROUTE_MAX_OBSERVATION_MS = 1500;

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
