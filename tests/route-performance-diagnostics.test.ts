import assert from "node:assert/strict";
import test from "node:test";
import {
  APP_ROUTE_MAX_OBSERVATION_MS,
  APP_ROUTE_MIN_OBSERVATION_MS,
  getNavigationReportDecision,
  getRouteDataTiming,
  routeTimingSince,
  isTrackedPerformancePath
} from "@/lib/performance/route-performance";

test("navigation report decisions wait for bounded observation and quiet windows", () => {
  const tooEarly = getNavigationReportDecision({
    candidateCompletedAt: 300,
    observedAt: APP_ROUTE_MIN_OBSERVATION_MS - 1,
    pathReadyAt: 0,
    startedAt: 0
  });
  assert.equal(tooEarly.shouldReport, false);

  const lateResourceStillBusy = getNavigationReportDecision({
    candidateCompletedAt: 750,
    observedAt: APP_ROUTE_MIN_OBSERVATION_MS,
    pathReadyAt: 0,
    startedAt: 0
  });
  assert.equal(lateResourceStillBusy.shouldReport, false);

  const stable = getNavigationReportDecision({
    candidateCompletedAt: 670,
    observedAt: 900,
    pathReadyAt: 100,
    startedAt: 0
  });
  assert.equal(stable.shouldReport, true);
  assert.equal(stable.stabilizationMs, 230);

  const bounded = getNavigationReportDecision({
    candidateCompletedAt: APP_ROUTE_MAX_OBSERVATION_MS + 90,
    observedAt: APP_ROUTE_MAX_OBSERVATION_MS + 100,
    pathReadyAt: 100,
    startedAt: 0
  });
  assert.equal(bounded.shouldReport, true);

  // The same 195ms route in a twenty-minute-old tab must stay a 195ms route.
  assert.deepEqual(
    getRouteDataTiming({
      startedAt: 1_200_000,
      measuredAt: 1_200_300,
      paintedAt: 1_200_195,
      parsedAt: 120
    }),
    { durationMs: 195, paintedMs: 195, parsedMs: null }
  );
  assert.equal(
    getRouteDataTiming({ startedAt: 0, measuredAt: 300, paintedAt: 195, parsedAt: 120 }).durationMs,
    195
  );
  assert.equal(
    getRouteDataTiming({
      startedAt: 1_200_000,
      measuredAt: 1_200_300,
      paintedAt: 195,
      parsedAt: 120
    }).durationMs,
    300
  );
  assert.equal(routeTimingSince(195, 1_200_000), null);
});

test("navigation report path allowlist covers product surfaces only", () => {
  for (const path of [
    "/logs",
    "/logs/123",
    "/logs-canary",
    "/dashboard",
    "/decks",
    "/deck-lists/123",
    "/tournaments",
    "/stats",
    "/calculator",
    "/profile",
    "/friends",
    "/players/123",
    "/replays/123",
    "/admin/dashboard"
  ]) {
    assert.equal(isTrackedPerformancePath(path), true, path);
  }

  for (const path of ["/", "/login", "/signup", "/forgot-password", "/api/performance-events"]) {
    assert.equal(isTrackedPerformancePath(path), false, path);
  }
});
