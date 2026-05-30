import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { logAuthDebug } from "@/lib/server/auth-debug";
import { buildAppOriginFromHeaders } from "@/lib/server/app-url";
import { syncCurrentProfileFromAuthUser } from "@/lib/db/profile";

function getSupabaseEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return { supabaseUrl, supabaseAnonKey };
}

// oxlint-disable-next-line react-doctor/nextjs-no-side-effect-in-get-handler -- OAuth providers return the one-time code to this GET callback.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const appOrigin = buildAppOriginFromHeaders(request.headers);

  if (!code) {
    return NextResponse.redirect(new URL("/login", appOrigin));
  }

  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
  const response = NextResponse.redirect(new URL("/logs", appOrigin));

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options as CookieOptions);
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
    return NextResponse.redirect(new URL("/login", appOrigin));
  }

  if (data.user) {
    await syncCurrentProfileFromAuthUser(data.user);
  }

  response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
  response.headers.set("Expires", "0");
  response.headers.set("Pragma", "no-cache");

  return response;
}
