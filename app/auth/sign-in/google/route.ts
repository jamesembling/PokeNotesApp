import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { buildAppOriginFromHeaders } from "@/lib/server/app-url";

function getSupabaseEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return { supabaseUrl, supabaseAnonKey };
}

async function startGoogleSignIn(request: NextRequest) {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
  const appOrigin = buildAppOriginFromHeaders(request.headers);
  const redirectTo = new URL("/auth/callback", appOrigin).toString();
  const loginUrl = new URL("/login", appOrigin);
  const response = NextResponse.next();

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

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true
    }
  });

  if (error || !data.url) {
    loginUrl.searchParams.set("error", error?.message ?? "Unable to start OAuth flow.");
    return NextResponse.redirect(loginUrl);
  }

  const redirectResponse = NextResponse.redirect(data.url, 303);

  response.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });

  return redirectResponse;
}

// oxlint-disable-next-line react-doctor/nextjs-no-side-effect-in-get-handler -- Starting OAuth is a credential-establishing route and direct browser GETs must keep working.
export async function GET(request: NextRequest) {
  return startGoogleSignIn(request);
}

export async function POST(request: NextRequest) {
  return startGoogleSignIn(request);
}
