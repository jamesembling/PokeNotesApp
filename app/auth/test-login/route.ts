import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { syncCurrentProfileFromAuthUser } from "@/lib/db/profile";
import { buildAppOriginFromHeaders } from "@/lib/server/app-url";

function getSupabaseEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return { supabaseUrl, supabaseAnonKey };
}

function getTestLoginConfig() {
  const enabled = process.env.POKE_NOTES_ENABLE_TEST_LOGIN === "1";
  const secret = process.env.POKE_NOTES_TEST_LOGIN_SECRET || "";
  const email = process.env.POKE_NOTES_TEST_LOGIN_EMAIL || "";
  const password = process.env.POKE_NOTES_TEST_LOGIN_PASSWORD || "";

  return {
    configured: Boolean(enabled && secret && email && password),
    email,
    password,
    secret
  };
}

export async function POST(request: NextRequest) {
  const appOrigin = buildAppOriginFromHeaders(request.headers);
  const config = getTestLoginConfig();

  if (!config.configured) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (request.nextUrl.searchParams.get("secret") !== config.secret) {
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

  const { data, error } = await supabase.auth.signInWithPassword({
    email: config.email,
    password: config.password
  });

  if (error || !data.user) {
    return NextResponse.redirect(new URL("/login", appOrigin));
  }

  await syncCurrentProfileFromAuthUser(data.user);

  response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
  response.headers.set("Expires", "0");
  response.headers.set("Pragma", "no-cache");

  return response;
}

export async function GET(request: NextRequest) {
  const appOrigin = buildAppOriginFromHeaders(request.headers);
  const config = getTestLoginConfig();

  if (!config.configured) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (request.nextUrl.searchParams.get("secret") !== config.secret) {
    return NextResponse.redirect(new URL("/login", appOrigin));
  }

  const action = `/auth/test-login?secret=${encodeURIComponent(config.secret)}`;

  return new Response(
    `<!doctype html><html><body><form method="post" action="${action}"><button type="submit">Continue</button></form><script>document.forms[0].requestSubmit();</script></body></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8"
      }
    }
  );
}
