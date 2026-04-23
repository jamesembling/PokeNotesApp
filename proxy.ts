import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_CLAIMS_HEADER, createAuthClaimsHeader } from "@/lib/server/auth-claim-header";
import { logAuthDebug } from "@/lib/server/auth-debug";
import { measureServerCall } from "@/lib/server/perf";

function getSupabaseEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return { supabaseUrl, supabaseAnonKey };
}

export async function proxy(request: NextRequest) {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

  const requestPath = request.nextUrl.pathname;
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.delete(AUTH_CLAIMS_HEADER);
  let responseCookiesToSet: Array<{ name: string; value: string; options: CookieOptions }> = [];
  let responseHeadersToSet: Record<string, string> = {};
  let response = NextResponse.next({
    request: {
      headers: forwardedHeaders
    }
  });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        responseCookiesToSet = cookiesToSet.map(({ name, value, options }) => ({
          name,
          value,
          options: options as CookieOptions
        }));
        responseHeadersToSet = headers ?? {};

        response = NextResponse.next({
          request: {
            headers: forwardedHeaders
          }
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options as CookieOptions);
        });

        if (headers) {
          Object.entries(headers).forEach(([name, value]) => {
            response.headers.set(name, value);
          });
        }

        logAuthDebug("proxy.setAll", {
          path: requestPath,
          cookieNames: cookiesToSet.map(({ name }) => name)
        });
      }
    }
  });

  const { data, error } = await measureServerCall("proxy.auth.getClaims", async () =>
    await supabase.auth.getClaims()
  );

  logAuthDebug("proxy.getClaims", {
    path: requestPath,
    hasClaims: Boolean(data?.claims),
    error: error?.message ?? null,
    requestCookieNames: request.cookies.getAll().map(({ name }) => name)
  });

  const authClaimsHeader = await createAuthClaimsHeader(
    data?.claims
      ? {
          id: typeof data.claims.sub === "string" ? data.claims.sub : "",
          email: typeof data.claims.email === "string" ? data.claims.email : undefined,
          app_metadata:
            typeof data.claims.app_metadata === "object" && data.claims.app_metadata !== null
              ? data.claims.app_metadata
              : {},
          user_metadata:
            typeof data.claims.user_metadata === "object" && data.claims.user_metadata !== null
              ? data.claims.user_metadata
              : {},
          role: typeof data.claims.role === "string" ? data.claims.role : undefined
        }
      : null
  );

  if (authClaimsHeader) {
    forwardedHeaders.set(AUTH_CLAIMS_HEADER, authClaimsHeader);
    response = NextResponse.next({
      request: {
        headers: forwardedHeaders
      }
    });

    responseCookiesToSet.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });

    Object.entries(responseHeadersToSet).forEach(([name, value]) => {
      response.headers.set(name, value);
    });
  }

  if (requestPath.startsWith("/auth/") || requestPath === "/login") {
    response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
    response.headers.set("Expires", "0");
    response.headers.set("Pragma", "no-cache");
  }

  return response;
}

export const config = {
  // Keep the matcher intentionally narrow so auth refresh only runs on
  // admin surfaces that need the signed claims handoff. Regular app routes
  // are still protected by their server layouts via requireUser().
  matcher: [
    "/admin/:path*"
  ]
};
