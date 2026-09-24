import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { NextRequest } from "next/server";
import { AUTH_CLAIMS_HEADER } from "@/lib/server/auth-claim-header";
import { PROXY_AUTH_DURATION_HEADER } from "@/lib/server/perf";
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
  assert.equal(matches("/api/cron/sync-limitless-events"), true);
  assert.equal(matches("/logs"), false);
  assert.equal(matches("/logs/log-id"), true);
  assert.equal(matches("/logs/log-id/nested"), true);
  assert.equal(matches("/logs-canary"), false);

  const request = new NextRequest(
    "https://pokenotes.example/api/cron/sync-limitless-events",
    {
      headers: {
        authorization: "Bearer cron-secret",
        [AUTH_CLAIMS_HEADER]: "untrusted-claims",
        [PROXY_AUTH_DURATION_HEADER]: "999"
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
    assert.equal(response.headers.get(`x-middleware-request-${AUTH_CLAIMS_HEADER}`), null);
    assert.equal(
      response.headers.get(`x-middleware-request-${PROXY_AUTH_DURATION_HEADER}`),
      null
    );
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
