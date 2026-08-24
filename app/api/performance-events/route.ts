import { type NextRequest } from "next/server";
import { requireApiUser } from "@/lib/server/api-auth";
import { privateError, privateJson, reportApiError } from "@/lib/server/api-response";
import { createClient } from "@/lib/supabase/server";

type PerformanceEventPayload = {
  automationHint?: boolean | null;
  connectMs?: number | null;
  deploymentEnv?: string | null;
  deviceMemory?: number | null;
  documentDecodedBodySizeBytes?: number | null;
  domContentLoadedMs?: number | null;
  documentEncodedBodySizeBytes?: number | null;
  documentTransferSizeBytes?: number | null;
  dnsMs?: number | null;
  downlink?: number | null;
  durationMs?: number | null;
  effectiveType?: string | null;
  eventType?: string;
  finalResponseHeadersStartMs?: number | null;
  firstContentfulPaintMs?: number | null;
  firstInterimResponseStartMs?: number | null;
  fromPath?: string | null;
  hardwareConcurrency?: number | null;
  hydrationResourcesEndMs?: number | null;
  loadEventMs?: number | null;
  largestContentfulPaintMs?: number | null;
  loadingMs?: number | null;
  maxLongTaskMs?: number | null;
  navigationType?: string | null;
  nextHopProtocol?: string | null;
  performanceVariant?: string | null;
  parserDataMs?: number | null;
  parserShellMs?: number | null;
  reporterVersion?: number | null;
  resourceCount?: number | null;
  requestCorrelationId?: string | null;
  requestStartMs?: number | null;
  responseEndMs?: number | null;
  responseStartMs?: number | null;
  responseStreamMs?: number | null;
  routeContentVisibleMs?: number | null;
  routeDataVisibleMs?: number | null;
  routeDataPaintedMs?: number | null;
  routeShellVisibleMs?: number | null;
  routeShellPaintedMs?: number | null;
  rtt?: number | null;
  routeStabilizationMs?: number | null;
  saveData?: boolean | null;
  screenHeight?: number | null;
  screenWidth?: number | null;
  serverAuthMs?: number | null;
  serverAuthEndedMs?: number | null;
  serverAuthMethod?: string | null;
  serverAuthRefreshed?: boolean | null;
  serverAuthStartedMs?: number | null;
  serverCacheKeyVersion?: string | null;
  serverCacheLookupMs?: number | null;
  serverCacheOutcome?: string | null;
  serverFunctionRegion?: string | null;
  serverMappingMs?: number | null;
  serverRequestId?: string | null;
  serverResultBytes?: number | null;
  serverResultRows?: number | null;
  serverRouteEnteredMs?: number | null;
  serverRouteDataMs?: number | null;
  serverRouteDataEndedMs?: number | null;
  serverRouteDataStartedMs?: number | null;
  serverRuntimeBootAgeMs?: number | null;
  serverRuntimeBootId?: string | null;
  serverRuntimeInvocationOrdinal?: number | null;
  serverShellProfileMs?: number | null;
  serverSupabaseMs?: number | null;
  shellProfileLoadedMs?: number | null;
  shellVisibleMs?: number | null;
  sourceHost?: string | null;
  sourceOrigin?: string | null;
  submissionReason?: string | null;
  slowestResourceMs?: number | null;
  slowestResourcePath?: string | null;
  ttfbMs?: number | null;
  toPath?: string;
  totalBlockingTimeMs?: number | null;
  transferSizeBytes?: number | null;
  tlsMs?: number | null;
  documentDownloadMs?: number | null;
  visibilityState?: string | null;
  viewportHeight?: number | null;
  viewportWidth?: number | null;
  workerStartMs?: number | null;
};

const MAX_TEXT_LENGTH = 320;
const UUID_SEGMENT_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DYNAMIC_ROUTE_PARENTS = new Set(["decks", "lists", "logs", "matchups", "tournaments"]);
const PERFORMANCE_VARIANTS = new Set([
  "logs-delay-400",
  "logs-delay-1000",
  "logs-narrow-suspense",
  "logs-public-shell-canary",
  "logs-shell-only"
]);
const SUBMISSION_REASONS = new Set([
  "app-route",
  "data-parsed",
  "data-seen",
  "data-timeout",
  "initial-load",
  "page-hidden"
]);

function inferDeploymentEnv(host: string | null, payloadEnv: unknown) {
  const normalizedHost = host?.toLowerCase() ?? "";
  const normalizedPayloadEnv = typeof payloadEnv === "string" ? payloadEnv.toLowerCase() : "";

  if (normalizedHost.startsWith("localhost") || normalizedHost.startsWith("127.0.0.1")) {
    return "local";
  }

  if (normalizedHost === "poke-notes-app.vercel.app") {
    return "production";
  }

  if (normalizedHost.endsWith(".vercel.app")) {
    return "preview";
  }

  if (["local", "production", "preview"].includes(normalizedPayloadEnv)) {
    return normalizedPayloadEnv;
  }

  return "unknown";
}

function clampText(value: unknown, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.replace(/\s+/g, " ").trim();

  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

function clampNumber(value: unknown, max = 600_000) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(max, Math.round(value)));
}

function clampDecimal(value: unknown, max = 10_000) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(max, value));
}

function normalizeTelemetryPath(value: unknown) {
  const rawPath = clampText(value, 180);
  if (!rawPath || !rawPath.startsWith("/")) {
    return null;
  }

  const [pathname] = rawPath.split(/[?#]/);
  const segments = pathname.split("/");

  return segments
    .map((segment, index) => {
      if (UUID_SEGMENT_PATTERN.test(segment)) {
        return ":id";
      }

      const previousSegment = segments[index - 1];
      if (index > 1 && previousSegment && DYNAMIC_ROUTE_PARENTS.has(previousSegment)) {
        return ":id";
      }

      return segment;
    })
    .join("/");
}

function inferBrowserFamily(userAgent: string | null) {
  const normalized = userAgent?.toLowerCase() ?? "";

  if (normalized.includes("firefox/")) {
    return "firefox";
  }

  if (
    normalized.includes("chrome/") ||
    normalized.includes("chromium/") ||
    normalized.includes("crios/") ||
    normalized.includes("edg/")
  ) {
    return "chromium";
  }

  if (normalized.includes("safari/") && normalized.includes("applewebkit/")) {
    return "safari";
  }

  return "other";
}

function inferDeviceClass(viewportWidth: number | null) {
  if (viewportWidth === null) {
    return "unknown";
  }

  if (viewportWidth < 768) {
    return "mobile";
  }

  if (viewportWidth < 1024) {
    return "tablet";
  }

  return "desktop";
}

function normalizeNavigationType(
  eventType: "app-route" | "hard-load" | "route-data",
  value: unknown
) {
  if (eventType === "app-route") {
    return "app-route";
  }

  const normalized = clampText(value, 24);
  return normalized && ["back_forward", "navigate", "prerender", "reload"].includes(normalized)
    ? normalized
    : "unknown";
}

function normalizeVisibilityState(value: unknown) {
  const normalized = clampText(value, 16);
  return normalized && ["hidden", "prerender", "visible"].includes(normalized)
    ? normalized
    : "unknown";
}

function normalizePerformanceVariant(value: unknown) {
  const normalized = clampText(value, 64);
  return normalized && PERFORMANCE_VARIANTS.has(normalized) ? normalized : null;
}

function normalizeSubmissionReason(value: unknown) {
  const normalized = clampText(value, 32);
  return normalized && SUBMISSION_REASONS.has(normalized) ? normalized : null;
}

function getDeploymentId() {
  return clampText(
    process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_URL,
    180
  );
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const payload = (await request.json()) as PerformanceEventPayload;
    const eventType =
      payload.eventType === "app-route"
        ? "app-route"
        : payload.eventType === "route-data"
          ? "route-data"
          : "hard-load";
    const toPath = normalizeTelemetryPath(payload.toPath);
    const durationMs = clampNumber(payload.durationMs);
    const sourceHost = clampText(request.headers.get("host") || payload.sourceHost, 180);
    const viewportWidth = clampNumber(payload.viewportWidth, 100_000);

    if (!toPath || durationMs === null) {
      return privateError("Invalid performance event.", 400);
    }

    const supabase = await createClient();
    const performanceEvent = {
      browser_family: inferBrowserFamily(request.headers.get("user-agent")),
      connect_ms: clampNumber(payload.connectMs),
      device_memory: clampDecimal(payload.deviceMemory, 512),
      device_class: inferDeviceClass(viewportWidth),
      deployment_env: inferDeploymentEnv(sourceHost, payload.deploymentEnv),
      deployment_id: getDeploymentId(),
      document_decoded_body_size_bytes: clampNumber(
        payload.documentDecodedBodySizeBytes,
        100_000_000
      ),
      document_download_ms: clampNumber(payload.documentDownloadMs),
      document_encoded_body_size_bytes: clampNumber(
        payload.documentEncodedBodySizeBytes,
        100_000_000
      ),
      document_transfer_size_bytes: clampNumber(payload.documentTransferSizeBytes, 100_000_000),
      dom_content_loaded_ms: clampNumber(payload.domContentLoadedMs),
      dns_ms: clampNumber(payload.dnsMs),
      downlink: clampDecimal(payload.downlink),
      duration_ms: durationMs,
      effective_type: clampText(payload.effectiveType, 32),
      event_type: eventType,
      final_response_headers_start_ms: clampNumber(payload.finalResponseHeadersStartMs),
      first_contentful_paint_ms: clampNumber(payload.firstContentfulPaintMs),
      first_interim_response_start_ms: clampNumber(payload.firstInterimResponseStartMs),
      from_path: normalizeTelemetryPath(payload.fromPath),
      hardware_concurrency: clampNumber(payload.hardwareConcurrency, 512),
      hydration_resources_end_ms: clampNumber(payload.hydrationResourcesEndMs),
      load_event_ms: clampNumber(payload.loadEventMs),
      largest_contentful_paint_ms: clampNumber(payload.largestContentfulPaintMs),
      loading_ms: clampNumber(payload.loadingMs),
      max_long_task_ms: clampNumber(payload.maxLongTaskMs),
      navigation_type: normalizeNavigationType(eventType, payload.navigationType),
      next_hop_protocol: clampText(payload.nextHopProtocol, 32),
      performance_variant: normalizePerformanceVariant(payload.performanceVariant),
      parser_data_ms: clampNumber(payload.parserDataMs),
      parser_shell_ms: clampNumber(payload.parserShellMs),
      reporter_version: clampNumber(payload.reporterVersion, 100) ?? 1,
      request_correlation_id: clampText(payload.requestCorrelationId, 180),
      request_start_ms: clampNumber(payload.requestStartMs),
      response_end_ms: clampNumber(payload.responseEndMs),
      response_start_ms: clampNumber(payload.responseStartMs),
      response_stream_ms: clampNumber(payload.responseStreamMs),
      route_content_visible_ms: clampNumber(payload.routeContentVisibleMs),
      route_data_painted_ms: clampNumber(payload.routeDataPaintedMs),
      route_data_visible_ms: clampNumber(payload.routeDataVisibleMs),
      route_shell_painted_ms: clampNumber(payload.routeShellPaintedMs),
      route_shell_visible_ms: clampNumber(payload.routeShellVisibleMs),
      resource_count: clampNumber(payload.resourceCount, 10_000),
      rtt: clampNumber(payload.rtt, 60_000),
      route_stabilization_ms: clampNumber(payload.routeStabilizationMs, 60_000),
      save_data: Boolean(payload.saveData),
      screen_height: clampNumber(payload.screenHeight, 100_000),
      screen_width: clampNumber(payload.screenWidth, 100_000),
      server_auth_ms: clampNumber(payload.serverAuthMs),
      server_auth_ended_ms: clampNumber(payload.serverAuthEndedMs),
      server_auth_method: clampText(payload.serverAuthMethod, 64),
      server_auth_refreshed:
        typeof payload.serverAuthRefreshed === "boolean" ? payload.serverAuthRefreshed : null,
      server_auth_started_ms: clampNumber(payload.serverAuthStartedMs),
      server_cache_key_version: clampText(payload.serverCacheKeyVersion, 64),
      server_cache_lookup_ms: clampNumber(payload.serverCacheLookupMs),
      server_cache_outcome: clampText(payload.serverCacheOutcome, 24),
      server_function_region: clampText(payload.serverFunctionRegion, 64),
      server_mapping_ms: clampNumber(payload.serverMappingMs),
      server_request_id: clampText(payload.serverRequestId, 180),
      server_result_bytes: clampNumber(payload.serverResultBytes, 100_000_000),
      server_result_rows: clampNumber(payload.serverResultRows, 100_000),
      server_route_entered_ms: clampNumber(payload.serverRouteEnteredMs),
      server_route_data_ms: clampNumber(payload.serverRouteDataMs),
      server_route_data_ended_ms: clampNumber(payload.serverRouteDataEndedMs),
      server_route_data_started_ms: clampNumber(payload.serverRouteDataStartedMs),
      server_runtime_boot_age_ms: clampNumber(payload.serverRuntimeBootAgeMs, 86_400_000),
      server_runtime_boot_id: clampText(payload.serverRuntimeBootId, 180),
      server_runtime_invocation_ordinal: clampNumber(
        payload.serverRuntimeInvocationOrdinal,
        1_000_000
      ),
      server_shell_profile_ms: clampNumber(payload.serverShellProfileMs),
      server_supabase_ms: clampNumber(payload.serverSupabaseMs),
      shell_profile_loaded_ms: clampNumber(payload.shellProfileLoadedMs),
      shell_visible_ms: clampNumber(payload.shellVisibleMs),
      slowest_resource_ms: clampNumber(payload.slowestResourceMs),
      slowest_resource_path: clampText(payload.slowestResourcePath, 220),
      source_host: sourceHost,
      source_origin: clampText(payload.sourceOrigin, 220),
      submission_reason: normalizeSubmissionReason(payload.submissionReason),
      to_path: toPath,
      total_blocking_time_ms: clampNumber(payload.totalBlockingTimeMs),
      traffic_class: payload.automationHint === true ? "automation" : "unclassified",
      transfer_size_bytes: clampNumber(payload.transferSizeBytes, 100_000_000),
      tls_ms: clampNumber(payload.tlsMs),
      ttfb_ms: clampNumber(payload.ttfbMs),
      user_id: user.id,
      visibility_state: normalizeVisibilityState(payload.visibilityState),
      viewport_height: clampNumber(payload.viewportHeight, 100_000),
      viewport_width: viewportWidth,
      worker_start_ms: clampNumber(payload.workerStartMs)
    };
    let { error } = await supabase.from("route_performance_events").insert(performanceEvent);

    // Keep the telemetry endpoint available while the additive migration is
    // rolling out behind an already-deployed application revision.
    if (
      error?.code === "PGRST204" &&
      (error.message.includes("final_response_headers_start_ms") ||
        error.message.includes("first_interim_response_start_ms") ||
        error.message.includes("server_auth_refreshed") ||
        error.message.includes("server_route_entered_ms"))
    ) {
      const {
        final_response_headers_start_ms: removedFinalResponseHeadersStart,
        first_interim_response_start_ms: removedFirstInterimResponseStart,
        server_auth_refreshed: removedAuthRefreshed,
        server_route_entered_ms: removedRouteEntered,
        ...legacyPerformanceEvent
      } = performanceEvent;
      void removedFinalResponseHeadersStart;
      void removedFirstInterimResponseStart;
      void removedAuthRefreshed;
      void removedRouteEntered;
      ({ error } = await supabase
        .from("route_performance_events")
        .insert(legacyPerformanceEvent));
    }

    if (
      error?.code === "23514" &&
      error.message.includes("route_performance_events_performance_variant_check")
    ) {
      const {
        final_response_headers_start_ms: removedFinalResponseHeadersStart,
        first_interim_response_start_ms: removedFirstInterimResponseStart,
        ...preResponseBoundaryEvent
      } = performanceEvent;
      void removedFinalResponseHeadersStart;
      void removedFirstInterimResponseStart;
      ({ error } = await supabase.from("route_performance_events").insert({
        ...preResponseBoundaryEvent,
        performance_variant: null
      }));
    }

    if (error) {
      throw error;
    }

    return privateJson({ ok: true });
  } catch (error) {
    return reportApiError(
      error,
      {
        action: "createPerformanceEvent",
        area: "api",
        boundary: "performance-events-route",
        route: "/api/performance-events"
      },
      "Could not record performance event."
    );
  }
}
