import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { syncCurrentProfileFromAuthUser } from "@/lib/db/profile";
import {
  validateLocalLoginAttempt,
  validateLocalLoginRequest
} from "@/lib/server/local-test-login";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/server/no-store";

function privateRedirect(url: URL) {
  return NextResponse.redirect(url, {
    headers: PRIVATE_NO_STORE_HEADERS,
    status: 303
  });
}

function getSupabaseEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return { supabaseUrl, supabaseAnonKey };
}

export async function POST(request: NextRequest) {
  const requestValidation = validateLocalLoginRequest({
    host: request.headers.get("host"),
    origin: request.headers.get("origin"),
    secFetchSite: request.headers.get("sec-fetch-site")
  });

  if (!requestValidation.allowed) {
    return NextResponse.json(
      { error: "Not found" },
      { headers: PRIVATE_NO_STORE_HEADERS, status: 404 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { headers: PRIVATE_NO_STORE_HEADERS, status: 400 }
    );
  }
  const pairingCode = String(formData.get("pairingCode") || "");
  const validation = validateLocalLoginAttempt({
    host: request.headers.get("host"),
    origin: request.headers.get("origin"),
    pairingCode,
    secFetchSite: request.headers.get("sec-fetch-site")
  });

  if (!validation.allowed) {
    if (validation.reason === "pairing-code") {
      return privateRedirect(
        new URL("/login?localError=pairing-code", validation.origin)
      );
    }

    return NextResponse.json(
      { error: "Not found" },
      { headers: PRIVATE_NO_STORE_HEADERS, status: 404 }
    );
  }

  const { config, origin } = validation;

  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
  const response = privateRedirect(new URL("/logs", origin));
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

  const { data, error } = await supabase.auth.signInWithPassword({
    email: config.email,
    password: config.password
  });

  if (error || !data.user) {
    const errorResponse = privateRedirect(new URL("/login?localError=sign-in", origin));
    response.cookies.getAll().forEach((cookie) => {
      errorResponse.cookies.set(cookie);
    });
    Object.entries(authResponseHeaders).forEach(([name, value]) => {
      errorResponse.headers.set(name, value);
    });
    return errorResponse;
  }

  await syncCurrentProfileFromAuthUser(data.user);

  response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
  response.headers.set("Expires", "0");
  response.headers.set("Pragma", "no-cache");

  return response;
}
