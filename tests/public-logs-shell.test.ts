import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { config as proxyConfig } from "@/proxy";

const require = createRequire(import.meta.url);
const { getMiddlewareMatchers } = require(
  "next/dist/build/analysis/get-page-static-info"
) as {
  getMiddlewareMatchers: (
    matcher: string | string[],
    nextConfig: Record<string, unknown>
  ) => Array<{ regexp: string }>;
};

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("the promoted logs route and canary have request-independent launch shells", () => {
  const rootLayout = source("app/layout.tsx");
  const logsLayout = source("app/(public-app)/logs/layout.tsx");
  const logsPage = source("app/(public-app)/logs/page.tsx");
  const canaryLayout = source("app/(public-app)/logs-canary/layout.tsx");
  const canaryPage = source("app/(public-app)/logs-canary/page.tsx");
  const bootstrapClient = source("components/ui/LogsBootstrapClient.tsx");
  const proxy = source("proxy.ts");

  assert.doesNotMatch(rootLayout, /from "next\/headers"/);
  assert.doesNotMatch(rootLayout, /cookies\(\)/);
  assert.match(rootLayout, /THEME_BOOTSTRAP_SCRIPT/);
  assert.match(logsLayout, /waitForBootstrapBeforeProfile/);
  assert.match(logsPage, /LogsBootstrapClient/);
  assert.match(logsPage, /logs-public-shell/);
  assert.match(canaryLayout, /waitForBootstrapBeforeProfile/);
  assert.match(canaryPage, /LogsBootstrapClient/);
  assert.match(canaryPage, /logs-public-shell-canary/);
  assert.match(bootstrapClient, /\/api\/logs\/bootstrap/);
  assert.match(bootstrapClient, /window\.location\.replace\("\/login"\)/);
  assert.doesNotMatch(bootstrapClient, /LogsLastKnown/);
  assert.match(proxy, /"\/logs\/:path\+"/);
  assert.match(source("components/ui/RoutePerformanceReporter.tsx"), /waitingForLogsBootstrap/);
});

test("Proxy skips the public logs shell but still protects log details", () => {
  const matchers = getMiddlewareMatchers(proxyConfig.matcher, {});
  const matches = (path: string) =>
    matchers.some((matcher) => new RegExp(matcher.regexp).test(path));

  assert.equal(matches("/logs"), false);
  assert.equal(matches("/logs/log-id"), true);
  assert.equal(matches("/logs/log-id/nested"), true);
  assert.equal(matches("/logs-canary"), false);
});

test("the logs bootstrap is the sole private auth and data boundary", () => {
  const bootstrapRoute = source("app/api/logs/bootstrap/route.ts");
  const deferredAccount = source("components/ui/DeferredSidebarAccount.tsx");

  assert.match(bootstrapRoute, /createServerClient/);
  assert.match(bootstrapRoute, /getVerifiedClaims/);
  assert.match(bootstrapRoute, /loadInitialLogsPageData/);
  assert.match(bootstrapRoute, /authResponseHeaders/);
  assert.match(bootstrapRoute, /privateJson/);
  assert.doesNotMatch(bootstrapRoute, /service_role|SUPABASE_SERVICE/);
  assert.match(deferredAccount, /pokenotes:logs-bootstrap-settled/);
});
