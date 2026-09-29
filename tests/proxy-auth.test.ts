import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { AUTH_CLAIMS_HEADER } from "@/lib/server/auth-claim-header";
import {
  PROXY_AUTH_DURATION_HEADER,
  PROXY_AUTH_ENDED_HEADER,
  PROXY_AUTH_METHOD_HEADER,
  PROXY_AUTH_REFRESHED_HEADER,
  PROXY_AUTH_STARTED_HEADER,
  PROXY_REGION_HEADER,
  REQUEST_CORRELATION_HEADER,
  REQUEST_STARTED_HEADER
} from "@/lib/server/perf";
import { config as proxyConfig, proxy } from "@/proxy";

const require = createRequire(import.meta.url);
const { getMiddlewareMatchers } = require(
  "next/dist/build/analysis/get-page-static-info"
) as {
  getMiddlewareMatchers: (
    matcher: string | string[],
    nextConfig: Record<string, unknown>
  ) => Array<{ regexp: string }>;
};

test("Proxy refreshes authenticated routes but skips public and cron work", async () => {
  const matchers = getMiddlewareMatchers(proxyConfig.matcher, {});
  const matches = (path: string) =>
    matchers.some((matcher) => new RegExp(matcher.regexp).test(path));

  assert.equal(matches("/"), true);
  assert.equal(matches("/login"), true);
  assert.equal(matches("/dashboard"), true);
  assert.equal(matches("/dashboard/events"), true);
  assert.equal(matches("/deck-lists"), true);
  assert.equal(matches("/deck-lists/list-id"), true);
  assert.equal(matches("/api/site-formats"), true);
  assert.equal(matches("/api/logs/bootstrap"), true);
  assert.equal(matches("/api/cron/sync-limitless-events"), true);
  assert.equal(matches("/logs"), false);
  assert.equal(matches("/logs/log-id"), true);
  assert.equal(matches("/logs/log-id/nested"), true);
  assert.equal(matches("/logs-canary"), false);

  const internalHeaders = [
    AUTH_CLAIMS_HEADER,
    PROXY_AUTH_DURATION_HEADER,
    PROXY_AUTH_ENDED_HEADER,
    PROXY_AUTH_METHOD_HEADER,
    PROXY_AUTH_REFRESHED_HEADER,
    PROXY_AUTH_STARTED_HEADER,
    PROXY_REGION_HEADER,
    REQUEST_CORRELATION_HEADER,
    REQUEST_STARTED_HEADER
  ];
  const request = new NextRequest(
    "https://pokenotes.example/api/cron/sync-limitless-events",
    {
      headers: {
        authorization: "Bearer cron-secret",
        ...Object.fromEntries(internalHeaders.map((name) => [name, "untrusted"]))
      }
    }
  );
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  try {
    const response = await proxy(request);
    assert.equal(response.headers.get("x-middleware-next"), "1");
    assert.equal(
      response.headers.get("x-middleware-request-authorization"),
      "Bearer cron-secret"
    );
    for (const name of internalHeaders) {
      assert.equal(response.headers.get(`x-middleware-request-${name}`), null, name);
    }
  } finally {
    if (supabaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
    }

    if (supabaseAnonKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = supabaseAnonKey;
    }
  }
});

test("Proxy forwards refreshed session cookies to the downstream request", {
  skip: process.env.POKENOTES_E2E_LOCAL !== "1"
}, async (t) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  assert.equal(new URL(url!).origin, "http://127.0.0.1:54321");
  assert.ok(key);

  const previousRegion = process.env.VERCEL_REGION;
  process.env.VERCEL_REGION = "lhr1";
  t.after(() => {
    if (previousRegion === undefined) delete process.env.VERCEL_REGION;
    else process.env.VERCEL_REGION = previousRegion;
  });

  const cookieJar = new Map<string, string>();
  const signInClient = createServerClient(url!, key, {
    cookies: {
      getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => cookieJar.set(name, value))
    }
  });
  const { data, error } = await signInClient.auth.signInWithPassword({
    email: process.env.POKE_NOTES_TEST_LOGIN_EMAIL!,
    password: process.env.POKE_NOTES_TEST_LOGIN_PASSWORD!
  });
  assert.ifError(error);
  assert.ok(data.session?.refresh_token);
  assert.equal(cookieJar.size, 1, "The synthetic session should use one cookie chunk.");

  const [[name, encoded]] = [...cookieJar];
  assert.ok(encoded.startsWith("base64-"));
  const session = JSON.parse(Buffer.from(encoded.slice(7), "base64url").toString("utf8"));
  const tokenParts = session.access_token.split(".");
  const claims = JSON.parse(Buffer.from(tokenParts[1], "base64url").toString("utf8"));
  claims.exp = Math.floor(Date.now() / 1000) - 60;
  session.access_token = `${tokenParts[0]}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${tokenParts[2]}`;
  session.expires_at = claims.exp;
  const expiredCookie = `${name}=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  const request = new NextRequest("http://localhost:3010/api/deck-selection-options", {
    headers: {
      cookie: expiredCookie,
      [AUTH_CLAIMS_HEADER]: "forged-claims",
      [PROXY_REGION_HEADER]: "forged-region",
      [REQUEST_STARTED_HEADER]: "1"
    }
  });

  const response = await proxy(request);
  const forwardedCookie = response.headers.get("x-middleware-request-cookie");
  assert.ok(forwardedCookie);
  assert.ok(forwardedCookie !== expiredCookie, "The route must not receive the expired access token.");
  assert.ok(forwardedCookie === request.headers.get("cookie"));
  assert.ok(response.headers.get(`x-middleware-request-${AUTH_CLAIMS_HEADER}`) !== "forged-claims");
  assert.equal(response.headers.get(`x-middleware-request-${PROXY_REGION_HEADER}`), "lhr1");
  assert.ok(Number(response.headers.get(`x-middleware-request-${REQUEST_STARTED_HEADER}`)) > 1);
  assert.ok(response.headers.get("set-cookie"), "The browser must receive the refreshed cookie.");

  const routeCookies = new NextRequest("http://localhost:3010/api/deck-selection-options", {
    headers: { cookie: forwardedCookie }
  }).cookies;
  const routeClient = createServerClient(url!, key, {
    cookies: {
      getAll: () => routeCookies.getAll(),
      setAll: () => { throw new Error("The downstream route should not need another refresh."); }
    }
  });
  const { data: decks, error: queryError } = await routeClient
    .from("decks")
    .select("id")
    .eq("id", "e2e-deck-dragapult");
  assert.ifError(queryError);
  assert.equal(decks?.length, 1);
});
