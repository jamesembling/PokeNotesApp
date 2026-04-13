import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { logAuthDebug } from "@/lib/server/auth-debug";

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
  let response = NextResponse.next({
    request: {
      headers: request.headers
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

        response = NextResponse.next({
          request: {
            headers: request.headers
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

  const { data, error } = await supabase.auth.getUser();

  logAuthDebug("proxy.getUser", {
    path: requestPath,
    hasUser: Boolean(data.user),
    error: error?.message ?? null,
    requestCookieNames: request.cookies.getAll().map(({ name }) => name)
  });

  if (requestPath.startsWith("/auth/") || requestPath === "/login") {
    response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
    response.headers.set("Expires", "0");
    response.headers.set("Pragma", "no-cache");
  }

  return response;
}

export const config = {
  matcher: [
    "/logs/:path*",
    "/decks/:path*",
    "/tournaments/:path*",
    "/profile/:path*",
    "/stats/:path*",
    "/admin/:path*"
  ]
};
