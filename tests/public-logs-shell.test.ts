import assert from "node:assert/strict";
import { createRequire } from "node:module";
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

test("Proxy skips the public logs shell but still protects log details", () => {
  const matchers = getMiddlewareMatchers(proxyConfig.matcher, {});
  const matches = (path: string) =>
    matchers.some((matcher) => new RegExp(matcher.regexp).test(path));

  assert.equal(matches("/logs"), false);
  assert.equal(matches("/logs/log-id"), true);
  assert.equal(matches("/logs/log-id/nested"), true);
  assert.equal(matches("/logs-canary"), false);
});
