import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { logAuthDebug } from "@/lib/server/auth-debug";
import { buildAppOriginFromHeaders } from "@/lib/server/app-url";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/server/no-store";
import { syncCurrentProfileFromAuthUser } from "@/lib/db/profile";
import { getSupabaseEnv } from "@/lib/supabase/env";

// oxlint-disable-next-line react-doctor/nextjs-no-side-effect-in-get-handler -- OAuth providers return the one-time code to this GET callback.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const appOrigin = buildAppOriginFromHeaders(request.headers);

  if (!code) {
    return NextResponse.redirect(new URL("/login", appOrigin));
  }

  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
  const response = NextResponse.redirect(new URL("/dashboard", appOrigin), {
    headers: PRIVATE_NO_STORE_HEADERS
  });
  let authResponseHeaders: Record<string, string> = {};

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        authResponseHeaders = headers;
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options as CookieOptions);
        });

        Object.entries(headers).forEach(([name, value]) => {
          response.headers.set(name, value);
        });
      }
    }
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  logAuthDebug("auth.callback.exchangeCodeForSession", {
    hasCode: true,
    error: error?.message ?? null
  });

  if (error) {
    const errorResponse = NextResponse.redirect(new URL("/login", appOrigin), {
      headers: PRIVATE_NO_STORE_HEADERS
    });
    response.cookies.getAll().forEach((cookie) => {
      errorResponse.cookies.set(cookie);
    });
    Object.entries(authResponseHeaders).forEach(([name, value]) => {
      errorResponse.headers.set(name, value);
    });
    return errorResponse;
  }

  if (data.user) {
    await syncCurrentProfileFromAuthUser(data.user);
  }

  return response;
}
