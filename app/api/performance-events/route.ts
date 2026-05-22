import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { reportError } from "@/lib/server/report-error";
import { createClient } from "@/lib/supabase/server";

type PerformanceEventPayload = {
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
  resourceCount?: number | null;
  rtt?: number | null;
  saveData?: boolean | null;
  screenHeight?: number | null;
  screenWidth?: number | null;
  sourceHost?: string | null;
  sourceOrigin?: string | null;
  slowestResourceMs?: number | null;
  slowestResourcePath?: string | null;
  ttfbMs?: number | null;
  toPath?: string;
  totalBlockingTimeMs?: number | null;
  transferSizeBytes?: number | null;
  userAgent?: string | null;
  viewportHeight?: number | null;
  viewportWidth?: number | null;
};

const MAX_TEXT_LENGTH = 320;

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

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const payload = (await request.json()) as PerformanceEventPayload;
    const eventType = payload.eventType === "app-route" ? "app-route" : "hard-load";
    const toPath = clampText(payload.toPath, 180);
    const durationMs = clampNumber(payload.durationMs);
    const sourceHost = clampText(request.headers.get("host") || payload.sourceHost, 180);

    if (!toPath || durationMs === null) {
      return NextResponse.json({ error: "Invalid performance event." }, { status: 400 });
    }

    const supabase = await createClient();
    const { error } = await supabase.from("route_performance_events").insert({
      device_memory: clampDecimal(payload.deviceMemory, 512),
      deployment_env: inferDeploymentEnv(sourceHost, payload.deploymentEnv),
      dom_content_loaded_ms: clampNumber(payload.domContentLoadedMs),
      downlink: clampDecimal(payload.downlink),
      duration_ms: durationMs,
      effective_type: clampText(payload.effectiveType, 32),
      event_type: eventType,
      from_path: clampText(payload.fromPath, 180),
      hardware_concurrency: clampNumber(payload.hardwareConcurrency, 512),
      load_event_ms: clampNumber(payload.loadEventMs),
      loading_ms: clampNumber(payload.loadingMs),
      max_long_task_ms: clampNumber(payload.maxLongTaskMs),
      resource_count: clampNumber(payload.resourceCount, 10_000),
      rtt: clampNumber(payload.rtt, 60_000),
      save_data: Boolean(payload.saveData),
      screen_height: clampNumber(payload.screenHeight, 100_000),
      screen_width: clampNumber(payload.screenWidth, 100_000),
      slowest_resource_ms: clampNumber(payload.slowestResourceMs),
      slowest_resource_path: clampText(payload.slowestResourcePath, 220),
      source_host: sourceHost,
      source_origin: clampText(payload.sourceOrigin, 220),
      to_path: toPath,
      total_blocking_time_ms: clampNumber(payload.totalBlockingTimeMs),
      transfer_size_bytes: clampNumber(payload.transferSizeBytes, 100_000_000),
      ttfb_ms: clampNumber(payload.ttfbMs),
      user_agent: clampText(payload.userAgent),
      user_id: user.id,
      viewport_height: clampNumber(payload.viewportHeight, 100_000),
      viewport_width: clampNumber(payload.viewportWidth, 100_000)
    });

    if (error) {
      throw error;
    }

    return NextResponse.json(
      { ok: true },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0"
        }
      }
    );
  } catch (error) {
    reportError(error, {
      action: "createPerformanceEvent",
      area: "api",
      boundary: "performance-events-route",
      route: "/api/performance-events"
    });

    return NextResponse.json({ error: "Could not record performance event." }, { status: 500 });
  }
}
