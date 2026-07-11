import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const nextConfig = require("../next.config.js") as {
  headers: () => Promise<
    Array<{
      headers: Array<{ key: string; value: string }>;
      source: string;
    }>
  >;
  poweredByHeader?: boolean;
};

test("Next.js does not disclose its powered-by header", () => {
  assert.equal(nextConfig.poweredByHeader, false);
});

test("all routes receive the conservative baseline security headers", async () => {
  const rules = await nextConfig.headers();
  const globalRule = rules.find((rule) => rule.source === "/(.*)");
  assert(globalRule, "expected a global response-header rule");

  const headers = new Map(globalRule.headers.map(({ key, value }) => [key, value]));
  assert.equal(headers.get("Permissions-Policy"), "camera=(), geolocation=(), microphone=()");
  assert.equal(headers.get("Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(headers.get("X-Frame-Options"), "DENY");
});

test("an unvalidated enforcing CSP is not introduced silently", async () => {
  const rules = await nextConfig.headers();
  const headerNames = rules.flatMap((rule) => rule.headers.map(({ key }) => key));

  assert(!headerNames.includes("Content-Security-Policy"));
});
