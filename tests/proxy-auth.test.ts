import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { AUTH_CLAIMS_HEADER, createAuthClaimsHeader } from "@/lib/server/auth-claim-header";
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
  assert.equal(matches("/api"), true);
  assert.equal(matches("/api/"), true);
  assert.equal(matches("/api/site-formats"), true);
  assert.equal(matches("/api/logs/bootstrap"), false);
  assert.equal(matches("/api/logs/bootstrap/"), false);
  assert.equal(matches("/api/logs/bootstrap-other"), true);
  assert.equal(matches("/api/logs/bootstrap/nested"), true);
  assert.equal(matches("/api/logs/update"), true);
  assert.equal(matches("/api/sidebar-profile"), true);
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

test("Authenticated requests refresh sessions before reading account data", {
  skip: process.env.POKENOTES_E2E_LOCAL !== "1",
  timeout: 90_000
}, async (t) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  assert.equal(new URL(url!).origin, "http://127.0.0.1:54321");
  assert.ok(key);
  assert.ok(process.env.POKENOTES_AUTH_CLAIMS_SECRET, "Reset the local fixtures to create their signing secret.");

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

  // Exercise the actual bootstrap request: its downstream clients must see a
  // session refreshed inside the route, and Next must return it to the browser.
  const baseUrl = "http://localhost:3010/api/logs/bootstrap";
  const portCheck = createServer();
  await new Promise<void>((resolve, reject) => {
    portCheck.once("error", () => reject(new Error("Port 3010 is occupied. Stop dev:e2e before running the local auth test.")));
    portCheck.listen(3010, "0.0.0.0", () => portCheck.close(() => resolve()));
  });
  const server = spawn(process.execPath, ["scripts/local-e2e.mjs", "dev"], {
    cwd: process.cwd(), detached: true, stdio: ["ignore", "pipe", "pipe"]
  });
  let startupOutput = "";
  const captureOutput = (chunk: Buffer) => {
    let output = chunk.toString();
    for (const value of [
      key, process.env.SUPABASE_SERVICE_ROLE_KEY,
      process.env.POKENOTES_AUTH_CLAIMS_SECRET,
      process.env.POKE_NOTES_TEST_LOGIN_PASSWORD
    ]) {
      if (value) output = output.replaceAll(value, "<redacted>");
    }
    startupOutput = `${startupOutput}${output}`.slice(-2_000);
  };
  server.stdout.on("data", captureOutput);
  server.stderr.on("data", captureOutput);
  t.after(async () => {
    if (!server.pid) return;
    const signalGroup = (signal: NodeJS.Signals | 0) => {
      try {
        process.kill(-server.pid!, signal);
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
        throw error;
      }
    };
    signalGroup("SIGTERM");
    const deadline = Date.now() + 5_000;
    while (signalGroup(0) && Date.now() < deadline) {
      await delay(100);
    }
    // The launcher can exit before its Next child. Clean up the whole owned
    // process group even when its leader has already exited.
    signalGroup("SIGKILL");
  });
  let ready = false;
  const readyDeadline = Date.now() + 45_000;
  while (Date.now() < readyDeadline) {
    assert.equal(server.exitCode, null, `The isolated local app exited during startup.\n${startupOutput}`);
    assert.equal(server.signalCode, null, `The isolated local app was interrupted during startup.\n${startupOutput}`);
    try {
      const readiness = await fetch(baseUrl, { signal: AbortSignal.timeout(1_000) });
      await readiness.body?.cancel();
      ready = readiness.status === 401;
      if (ready) break;
    } catch { /* Wait for the committed local app command to start. */ }
    await delay(100);
  }
  assert.ok(ready, `The isolated local bootstrap route was not ready within 45 seconds.\n${startupOutput}`);
  assert.equal(server.exitCode, null);
  assert.equal(server.signalCode, null);

  const signedOtherIdentity = await createAuthClaimsHeader({
    id: "11111111-1111-4111-8111-111111111111",
    app_metadata: {}, user_metadata: {}, role: "authenticated"
  });
  assert.ok(signedOtherIdentity);
  const forgedHeaders = {
    [AUTH_CLAIMS_HEADER]: signedOtherIdentity,
    [PROXY_AUTH_DURATION_HEADER]: "123",
    [PROXY_AUTH_ENDED_HEADER]: "456",
    [PROXY_AUTH_METHOD_HEADER]: "forged-method",
    [PROXY_AUTH_REFRESHED_HEADER]: "1",
    [PROXY_AUTH_STARTED_HEADER]: "100",
    [PROXY_REGION_HEADER]: "forged-region",
    [REQUEST_CORRELATION_HEADER]: "forged-correlation",
    [REQUEST_STARTED_HEADER]: "1"
  };
  const readBootstrap = async (cookie = "") => {
    const result = await fetch(baseUrl, {
      headers: { ...forgedHeaders, ...(cookie ? { cookie } : {}) },
      signal: AbortSignal.timeout(10_000)
    });
    assert.match(result.headers.get("cache-control") ?? "", /private.*no-store/);
    return { response: result, body: await result.json() };
  };
  const assertOwnData = (body: {
    stats: { total: number };
    window: { logs: Array<{ id: string }> };
    diagnostics: { requestTimeline: Record<string, unknown> };
  }) => {
    assert.equal(body.stats.total, 3);
    assert.equal(body.window.logs.length, 3);
    assert.ok(body.window.logs.every((log) => log.id.startsWith("e2e-log-")));
    for (const [field, value] of Object.entries(body.diagnostics.requestTimeline)) {
      if (field.startsWith("proxy")) assert.equal(value, null, field);
    }
  };
  const { error: secondSignInError } = await signInClient.auth.signInWithPassword({
    email: process.env.POKE_NOTES_TEST_LOGIN_EMAIL!,
    password: process.env.POKE_NOTES_TEST_LOGIN_PASSWORD!
  });
  assert.ifError(secondSignInError);
  const [[sessionName, freshEncoded]] = [...cookieJar];
  const fresh = await readBootstrap(`${sessionName}=${freshEncoded}`);
  assert.equal(fresh.response.status, 200);
  assertOwnData(fresh.body);
  assert.equal(fresh.body.diagnostics.authRefreshed, false);

  const staleSession = JSON.parse(Buffer.from(freshEncoded.slice(7), "base64url").toString("utf8"));
  const staleParts = staleSession.access_token.split(".");
  const staleClaims = JSON.parse(Buffer.from(staleParts[1], "base64url").toString("utf8"));
  staleClaims.exp = Math.floor(Date.now() / 1000) - 60;
  staleSession.access_token = `${staleParts[0]}.${Buffer.from(JSON.stringify(staleClaims)).toString("base64url")}.${staleParts[2]}`;
  staleSession.expires_at = staleClaims.exp;
  const encodeSession = () => `base64-${Buffer.from(JSON.stringify(staleSession)).toString("base64url")}`;
  const expired = await readBootstrap(`${sessionName}=${encodeSession()}; ${sessionName}.1=obsolete-chunk`);
  assert.equal(expired.response.status, 200);
  assertOwnData(expired.body);
  assert.equal(expired.body.diagnostics.authRefreshed, true);
  const cookieWrites = expired.response.headers.getSetCookie();
  assert.equal(cookieWrites.filter((value) => value.startsWith(`${sessionName}=`)).length, 1);
  assert.ok(cookieWrites.some((value) => value.startsWith(`${sessionName}.1=;`)), "The stale cookie chunk must be cleared.");
  const reloaded = await readBootstrap(cookieWrites.map((value) => value.split(";")[0]).join("; "));
  assert.equal(reloaded.response.status, 200);
  assertOwnData(reloaded.body);
  assert.equal(reloaded.body.diagnostics.authRefreshed, false);
  assert.equal(reloaded.response.headers.getSetCookie().length, 0);

  const anonymous = await readBootstrap();
  assert.equal(anonymous.response.status, 401);
  assert.deepEqual(anonymous.body, { error: "Authentication required." });
  staleSession.refresh_token = "invalid-refresh-token-for-local-test";
  const invalid = await readBootstrap(`${sessionName}=${encodeSession()}`);
  assert.equal(invalid.response.status, 401);
  assert.deepEqual(invalid.body, { error: "Authentication required." });
});
