import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { privateJson, reportApiError } from "@/lib/server/api-response";
import { loadInitialLogsPageData } from "@/lib/server/logs-page-data";
import { warmBattleLogImportContext } from "@/lib/server/battle-log-import-context-cache";
import { reportError } from "@/lib/server/report-error";
import {
  measureServerCallWithTimeline,
  PROXY_AUTH_DURATION_HEADER,
  PROXY_AUTH_ENDED_HEADER,
  PROXY_AUTH_METHOD_HEADER,
  PROXY_AUTH_REFRESHED_HEADER,
  PROXY_AUTH_STARTED_HEADER,
  PROXY_REGION_HEADER,
  REQUEST_CORRELATION_HEADER,
  REQUEST_STARTED_HEADER,
  takeServerRuntimeSnapshot
} from "@/lib/server/perf";
import { getVerifiedClaims } from "@/lib/supabase/verified-claims";
import type { Database } from "@/types/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabaseEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return { supabaseUrl, supabaseAnonKey };
}

function getUserId(claims: unknown) {
  if (!claims || typeof claims !== "object") {
    return null;
  }

  const sub = (claims as Record<string, unknown>).sub;
  return typeof sub === "string" && sub ? sub : null;
}

function readTimingHeader(requestHeaders: Headers, name: string, max = 600_000) {
  const raw = requestHeaders.get(name);
  if (!raw?.trim()) return null;

  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 && value <= max ? value : null;
}

export async function GET() {
  const requestStartedAt = Date.now();
  const processUptimeMs = Math.round(process.uptime() * 1_000);
  const requestCorrelationId = crypto.randomUUID();
  const runtime = takeServerRuntimeSnapshot();
  let authResponseHeaders: Record<string, string> = {};
  let authRefreshed = false;

  try {
    const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
    const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
    const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet, responseHeaders) {
          authRefreshed = cookiesToSet.length > 0;
          authResponseHeaders = responseHeaders;
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options as CookieOptions);
          });
        }
      }
    });

    const authTiming = await measureServerCallWithTimeline("api.logs.bootstrap.auth", () =>
      getVerifiedClaims(supabase, supabaseUrl)
    );
    const { method: authMethod, result: claimsResult } = authTiming.value;
    const userId = getUserId(claimsResult.data?.claims);

    if (claimsResult.error || !userId) {
      return privateJson(
        { error: "Authentication required." },
        { headers: authResponseHeaders, status: 401 }
      );
    }

    const importContextWarm = warmBattleLogImportContext(userId).catch((error) => {
      reportError(error, {
        action: "warmBattleLogImportContext",
        area: "logs",
        boundary: "logs-bootstrap-import-context-warm",
        route: "/api/logs/bootstrap"
      });
    });
    after(() => importContextWarm);

    const dataTiming = await measureServerCallWithTimeline("api.logs.bootstrap.data", () =>
      loadInitialLogsPageData(userId)
    );
    const diagnostics = dataTiming.value.diagnostics;
    const proxyRequestStartedAtEpochMs = readTimingHeader(
      requestHeaders,
      REQUEST_STARTED_HEADER,
      Number.MAX_SAFE_INTEGER
    );
    const proxyAuthEndedMs = readTimingHeader(requestHeaders, PROXY_AUTH_ENDED_HEADER);
    // These two differences cross function clocks. Keep negative values visible
    // rather than making clock skew look like a zero-duration handoff.
    const proxyToRouteMs = proxyRequestStartedAtEpochMs
      ? requestStartedAt - proxyRequestStartedAtEpochMs
      : null;
    const proxyAuthEndToRouteMs =
      proxyToRouteMs === null || proxyAuthEndedMs === null
        ? null
        : proxyToRouteMs - proxyAuthEndedMs;
    const routeResponsePreparedAtEpochMs = Date.now();
    const routePreAuthMs = Math.max(0, authTiming.startedAtEpochMs - requestStartedAt);
    const routeHandlerMs = Math.max(0, routeResponsePreparedAtEpochMs - requestStartedAt);
    const proxyAuthRefreshed = requestHeaders.get(PROXY_AUTH_REFRESHED_HEADER);
    const requestTimeline = {
      processUptimeMs,
      proxyAuthEndedMs,
      proxyAuthEndToRouteMs,
      proxyAuthMethod: requestHeaders.get(PROXY_AUTH_METHOD_HEADER),
      proxyAuthMs: readTimingHeader(requestHeaders, PROXY_AUTH_DURATION_HEADER),
      proxyAuthRefreshed:
        proxyAuthRefreshed === "1" ? true : proxyAuthRefreshed === "0" ? false : null,
      proxyAuthStartedMs: readTimingHeader(requestHeaders, PROXY_AUTH_STARTED_HEADER),
      proxyRequestCorrelationId: requestHeaders.get(REQUEST_CORRELATION_HEADER),
      proxyRegion: requestHeaders.get(PROXY_REGION_HEADER) || null,
      proxyRequestStartedAtEpochMs,
      proxyToRouteMs,
      routeHandlerMs,
      routePreAuthMs,
      routeResponsePreparedAtEpochMs,
      routeStartedAtEpochMs: requestStartedAt
    };
    const serverTiming = [
      `bootstrap-auth;dur=${authTiming.durationMs}`,
      `bootstrap-data;dur=${dataTiming.durationMs}`,
      `bootstrap-pre-auth;dur=${routePreAuthMs}`,
      `bootstrap-handler;dur=${routeHandlerMs}`
    ];
    if (proxyToRouteMs !== null && proxyToRouteMs >= 0) {
      serverTiming.push(`bootstrap-proxy-to-route;dur=${proxyToRouteMs}`);
    }
    if (proxyAuthEndToRouteMs !== null && proxyAuthEndToRouteMs >= 0) {
      serverTiming.push(`bootstrap-proxy-auth-end-to-route;dur=${proxyAuthEndToRouteMs}`);
    }

    return privateJson(
      {
        diagnostics: {
          authEndedMs: Math.max(0, authTiming.endedAtEpochMs - requestStartedAt),
          authMethod,
          authMs: authTiming.durationMs,
          authRefreshed,
          authStartedMs: Math.max(0, authTiming.startedAtEpochMs - requestStartedAt),
          cacheKeyVersion: diagnostics.cacheKeyVersion,
          cacheLookupMs: diagnostics.cacheLookupMs,
          cacheOutcome: diagnostics.cacheOutcome,
          dataEndedMs: Math.max(0, dataTiming.endedAtEpochMs - requestStartedAt),
          dataMs: dataTiming.durationMs,
          dataStartedMs: Math.max(0, dataTiming.startedAtEpochMs - requestStartedAt),
          mappingMs: diagnostics.mappingMs,
          requestCorrelationId,
          requestId: requestHeaders.get("x-vercel-id"),
          requestTimeline,
          resultBytes: diagnostics.resultBytes,
          resultRows: diagnostics.resultRows,
          runtimeBootAgeMs: runtime.bootAgeMs,
          runtimeBootId: runtime.bootId,
          runtimeInvocationOrdinal: runtime.invocationOrdinal,
          runtimeRegion: process.env.VERCEL_REGION || process.env.VERCEL_FUNCTION_REGION || null,
          supabaseMs: diagnostics.supabaseMs
        },
        stats: dataTiming.value.stats,
        window: dataTiming.value.window
      },
      {
        headers: {
          ...authResponseHeaders,
          "Server-Timing": serverTiming.join(", ")
        }
      }
    );
  } catch (error) {
    return reportApiError(
      error,
      {
        action: "loadLogsBootstrap",
        area: "logs",
        boundary: "logs-bootstrap-route",
        route: "/api/logs/bootstrap"
      },
      "Could not load your battle logs."
    );
  }
}
