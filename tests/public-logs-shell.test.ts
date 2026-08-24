import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("the public logs canary has a request-independent launch shell", () => {
  const rootLayout = source("app/layout.tsx");
  const canaryLayout = source("app/(public-app)/logs-canary/layout.tsx");
  const canaryPage = source("app/(public-app)/logs-canary/page.tsx");
  const canaryClient = source("components/ui/PublicLogsCanaryClient.tsx");
  const proxy = source("proxy.ts");

  assert.doesNotMatch(rootLayout, /from "next\/headers"/);
  assert.doesNotMatch(rootLayout, /cookies\(\)/);
  assert.match(rootLayout, /THEME_BOOTSTRAP_SCRIPT/);
  assert.match(canaryLayout, /waitForBootstrapBeforeProfile/);
  assert.match(canaryPage, /PublicLogsCanaryClient/);
  assert.match(canaryClient, /logs-public-shell-canary/);
  assert.match(canaryClient, /\/api\/logs\/bootstrap/);
  assert.doesNotMatch(canaryClient, /LogsLastKnown/);
  assert.doesNotMatch(proxy, /logs-canary/);
  assert.match(source("components/ui/RoutePerformanceReporter.tsx"), /waitingForLogsBootstrap/);
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
