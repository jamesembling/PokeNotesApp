import { type NextRequest } from "next/server";
import { requireApiUser } from "@/lib/server/api-auth";
import { privateError, privateJson, reportApiError } from "@/lib/server/api-response";
import { createClient } from "@/lib/supabase/server";

type PerformanceEventPayload = {
  automationHint?: boolean | null;
  deploymentEnv?: string | null;
  deviceMemory?: number | null;
  domContentLoadedMs?: number | null;
  downlink?: number | null;
  durationMs?: number | null;
  effectiveType?: string | null;
  eventType?: string;
  fromPath?: string | null;
  hardwareConcurrency?: number | null;
  loadEventMs?: number | null;
  loadingMs?: number | null;
  maxLongTaskMs?: number | null;
  navigationType?: string | null;
  reporterVersion?: number | null;
  resourceCount?: number | null;
  responseEndMs?: number | null;
  rtt?: number | null;
  routeStabilizationMs?: number | null;
  saveData?: boolean | null;
  screenHeight?: number | null;
  screenWidth?: number | null;
  serverAuthMs?: number | null;
  serverRouteDataMs?: number | null;
  serverShellProfileMs?: number | null;
  sourceHost?: string | null;
  sourceOrigin?: string | null;
  slowestResourceMs?: number | null;
  slowestResourcePath?: string | null;
  ttfbMs?: number | null;
  toPath?: string;
  totalBlockingTimeMs?: number | null;
  transferSizeBytes?: number | null;
  documentDownloadMs?: number | null;
  visibilityState?: string | null;
  viewportHeight?: number | null;
  viewportWidth?: number | null;
};

const MAX_TEXT_LENGTH = 320;
const UUID_SEGMENT_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DYNAMIC_ROUTE_PARENTS = new Set(["decks", "lists", "logs", "matchups", "tournaments"]);

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

function normalizeNavigationType(eventType: "app-route" | "hard-load", value: unknown) {
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

function getDeploymentId() {
  return clampText(
    process.env.VERCEL_DEPLOYMENT_ID ??
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.VERCEL_URL,
    180
  );
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const payload = (await request.json()) as PerformanceEventPayload;
    const eventType = payload.eventType === "app-route" ? "app-route" : "hard-load";
    const toPath = normalizeTelemetryPath(payload.toPath);
    const durationMs = clampNumber(payload.durationMs);
    const sourceHost = clampText(request.headers.get("host") || payload.sourceHost, 180);
    const viewportWidth = clampNumber(payload.viewportWidth, 100_000);

    if (!toPath || durationMs === null) {
      return privateError("Invalid performance event.", 400);
    }

    const supabase = await createClient();
    const { error } = await supabase.from("route_performance_events").insert({
      browser_family: inferBrowserFamily(request.headers.get("user-agent")),
      device_memory: clampDecimal(payload.deviceMemory, 512),
      device_class: inferDeviceClass(viewportWidth),
      deployment_env: inferDeploymentEnv(sourceHost, payload.deploymentEnv),
      deployment_id: getDeploymentId(),
      document_download_ms: clampNumber(payload.documentDownloadMs),
      dom_content_loaded_ms: clampNumber(payload.domContentLoadedMs),
      downlink: clampDecimal(payload.downlink),
      duration_ms: durationMs,
      effective_type: clampText(payload.effectiveType, 32),
      event_type: eventType,
      from_path: normalizeTelemetryPath(payload.fromPath),
      hardware_concurrency: clampNumber(payload.hardwareConcurrency, 512),
      load_event_ms: clampNumber(payload.loadEventMs),
      loading_ms: clampNumber(payload.loadingMs),
      max_long_task_ms: clampNumber(payload.maxLongTaskMs),
      navigation_type: normalizeNavigationType(eventType, payload.navigationType),
      reporter_version: clampNumber(payload.reporterVersion, 100) ?? 1,
      response_end_ms: clampNumber(payload.responseEndMs),
      resource_count: clampNumber(payload.resourceCount, 10_000),
      rtt: clampNumber(payload.rtt, 60_000),
      route_stabilization_ms: clampNumber(payload.routeStabilizationMs, 60_000),
      save_data: Boolean(payload.saveData),
      screen_height: clampNumber(payload.screenHeight, 100_000),
      screen_width: clampNumber(payload.screenWidth, 100_000),
      server_auth_ms: clampNumber(payload.serverAuthMs),
      server_route_data_ms: clampNumber(payload.serverRouteDataMs),
      server_shell_profile_ms: clampNumber(payload.serverShellProfileMs),
      slowest_resource_ms: clampNumber(payload.slowestResourceMs),
      slowest_resource_path: clampText(payload.slowestResourcePath, 220),
      source_host: sourceHost,
      source_origin: clampText(payload.sourceOrigin, 220),
      to_path: toPath,
      total_blocking_time_ms: clampNumber(payload.totalBlockingTimeMs),
      traffic_class: payload.automationHint === true ? "automation" : "unclassified",
      transfer_size_bytes: clampNumber(payload.transferSizeBytes, 100_000_000),
      ttfb_ms: clampNumber(payload.ttfbMs),
      user_id: user.id,
      visibility_state: normalizeVisibilityState(payload.visibilityState),
      viewport_height: clampNumber(payload.viewportHeight, 100_000),
      viewport_width: viewportWidth
    });

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
