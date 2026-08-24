import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { privateJson, reportApiError } from "@/lib/server/api-response";
import { loadInitialLogsPageData } from "@/lib/server/logs-page-data";
import {
  measureServerCallWithTimeline,
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

export async function GET() {
  const requestStartedAt = Date.now();
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

    const dataTiming = await measureServerCallWithTimeline("api.logs.bootstrap.data", () =>
      loadInitialLogsPageData(userId)
    );
    const diagnostics = dataTiming.value.diagnostics;

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
          "Server-Timing": `bootstrap-auth;dur=${authTiming.durationMs}, bootstrap-data;dur=${dataTiming.durationMs}`
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
