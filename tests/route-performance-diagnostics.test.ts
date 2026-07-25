import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  APP_ROUTE_MAX_OBSERVATION_MS,
  APP_ROUTE_MIN_OBSERVATION_MS,
  getNavigationReportDecision,
  ROUTE_REPORTER_VERSION
} from "@/lib/performance/route-performance";
import { measureServerCallWithTiming } from "@/lib/server/perf";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("app-route reporting waits for the bounded observation and quiet windows", () => {
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
});

test("timed server calls return only a duration and the original value", async () => {
  const result = await measureServerCallWithTiming("test.fixed-phase", async () => ({ ok: true }));

  assert.deepEqual(result.value, { ok: true });
  assert.equal(Number.isInteger(result.durationMs), true);
  assert.equal(result.durationMs >= 0, true);
});

test("route diagnostics use privacy-safe fixed fields", () => {
  const reporter = source("components/ui/RoutePerformanceReporter.tsx");
  const route = source("app/api/performance-events/route.ts");
  const middleware = source("middleware.ts");
  const marker = source("components/ui/RouteTimingMarker.tsx");
  const migration = source(
    "supabase/migrations/20260714182253_add_route_performance_diagnostics.sql"
  );

  assert.equal(ROUTE_REPORTER_VERSION, 2);
  assert.match(reporter, /documentDownloadMs/);
  assert.match(reporter, /responseEndMs/);
  assert.match(reporter, /routeStabilizationMs/);
  assert.match(reporter, /AUTOMATION_HASH = "#pokenotes-perf"/);
  assert.doesNotMatch(reporter, /userAgent:/);

  assert.match(route, /normalizeTelemetryPath/);
  assert.match(route, /traffic_class: payload\.automationHint === true \? "automation" : "unclassified"/);
  assert.match(route, /browser_family: inferBrowserFamily/);
  assert.doesNotMatch(route, /user_agent:/);

  assert.match(middleware, /export async function middleware/);
  assert.match(middleware, /supabase\.auth\.getClaims\(\)/);
  assert.match(middleware, /createAuthClaimsHeader/);
  assert.doesNotMatch(middleware, /auth\.getSession\(\)/);
  assert.match(middleware, /Server-Timing/);
  assert.match(middleware, /proxy-auth;dur=/);
  assert.match(middleware, /forwardedHeaders\.delete\(PROXY_AUTH_DURATION_HEADER\)/);
  assert.match(middleware, /forwardedHeaders\.set\(PROXY_AUTH_DURATION_HEADER/);
  assert.match(marker, /phase="proxy-auth"/);
  assert.match(migration, /server_shell_profile_ms/);
  assert.match(migration, /server_route_data_ms/);
  assert.match(migration, /route_performance_events_env_traffic_route_created_at/);
});
