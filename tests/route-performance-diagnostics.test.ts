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
import { measureServerCallWithTimeline, measureServerCallWithTiming } from "@/lib/server/perf";

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

test("server timeline calls expose ordered absolute boundaries", async () => {
  const result = await measureServerCallWithTimeline("test.timeline", async () => ({ ok: true }));

  assert.deepEqual(result.value, { ok: true });
  assert.equal(result.startedAtEpochMs <= result.endedAtEpochMs, true);
  assert.equal(result.durationMs >= 0, true);
});

test("route diagnostics use privacy-safe fixed fields", () => {
  const reporter = source("components/ui/RoutePerformanceReporter.tsx");
  const route = source("app/api/performance-events/route.ts");
  const proxy = source("proxy.ts");
  const marker = source("components/ui/RouteTimingMarker.tsx");
  const migration = source(
    "supabase/migrations/20260714182253_add_route_performance_diagnostics.sql"
  );
  const visibleTimingMigration = source(
    "supabase/migrations/20260822210947_add_visible_route_performance_timings.sql"
  );
  const streamingCanaryMigration = source(
    "supabase/migrations/20260822223633_add_route_streaming_canary_timings.sql"
  );
  const phaseCorrelationMigration = source(
    "supabase/migrations/20260822233544_add_route_performance_phase_correlation.sql"
  );

  assert.equal(ROUTE_REPORTER_VERSION, 5);
  assert.match(reporter, /responseStreamMs/);
  assert.match(reporter, /responseEndMs/);
  assert.match(reporter, /routeStabilizationMs/);
  assert.match(reporter, /firstContentfulPaintMs/);
  assert.match(reporter, /routeContentVisibleMs/);
  assert.match(reporter, /routeDataVisibleMs/);
  assert.match(reporter, /routeShellVisibleMs/);
  assert.match(reporter, /documentTransferSizeBytes/);
  assert.match(reporter, /nextHopProtocol/);
  assert.match(reporter, /performanceVariant/);
  assert.match(reporter, /parserShellMs/);
  assert.match(reporter, /routeDataPaintedMs/);
  assert.match(reporter, /submissionReason/);
  assert.match(reporter, /shellVisibleMs/);
  assert.match(reporter, /AUTOMATION_HASH = "#pokenotes-perf"/);
  assert.match(reporter, /ROUTE_DATA_PARSED_GRACE_MS = 1000/);
  assert.match(reporter, /scheduleParsedFallback/);
  assert.doesNotMatch(reporter, /userAgent:/);

  assert.match(route, /normalizeTelemetryPath/);
  assert.match(
    route,
    /traffic_class:\s*payload\.automationHint === true \? "automation" : "unclassified"/
  );
  assert.match(route, /browser_family: inferBrowserFamily/);
  assert.doesNotMatch(route, /user_agent:/);

  assert.match(proxy, /Server-Timing/);
  assert.match(proxy, /proxy-auth;dur=/);
  assert.match(proxy, /forwardedHeaders\.delete\(PROXY_AUTH_DURATION_HEADER\)/);
  assert.match(proxy, /forwardedHeaders\.set\(\s*PROXY_AUTH_DURATION_HEADER/);
  assert.match(marker, /phase="proxy-auth"/);
  assert.match(migration, /server_shell_profile_ms/);
  assert.match(migration, /server_route_data_ms/);
  assert.match(migration, /route_performance_events_env_traffic_route_created_at/);
  assert.match(visibleTimingMigration, /first_contentful_paint_ms/);
  assert.match(visibleTimingMigration, /route_content_visible_ms/);
  assert.match(visibleTimingMigration, /shell_profile_loaded_ms/);
  assert.match(streamingCanaryMigration, /route_shell_visible_ms/);
  assert.match(streamingCanaryMigration, /route_data_visible_ms/);
  assert.match(streamingCanaryMigration, /document_transfer_size_bytes/);
  assert.match(streamingCanaryMigration, /performance_variant/);
  assert.match(phaseCorrelationMigration, /request_correlation_id/);
  assert.match(phaseCorrelationMigration, /response_stream_ms/);
  assert.match(phaseCorrelationMigration, /submission_reason/);
  assert.match(phaseCorrelationMigration, /route-data/);
});
