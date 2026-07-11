import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  ApiAuthenticationError,
  isApiAuthenticationError
} from "@/lib/server/api-auth";
import {
  apiAuthenticationErrorResponse,
  reportApiError
} from "@/lib/server/api-response";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("private API authentication errors have a typed 401 response contract", async () => {
  const error = new ApiAuthenticationError();

  assert.equal(error.name, "ApiAuthenticationError");
  assert.equal(error.code, "AUTHENTICATION_REQUIRED");
  assert.equal(error.status, 401);
  assert.equal(isApiAuthenticationError(error), true);
  assert.equal(isApiAuthenticationError(new Error("Authentication required.")), false);
  assert.equal(apiAuthenticationErrorResponse(new Error("Authentication required.")), null);

  const response = reportApiError(
    error,
    {
      action: "testPrivateApiAuth",
      area: "api",
      boundary: "api-auth-test",
      route: "/api/test"
    },
    "Fallback server error."
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Authentication required." });
  assert.equal(
    response.headers.get("cache-control"),
    "private, no-cache, no-store, must-revalidate, max-age=0"
  );
});

test("all private JSON routes use the API auth guard while pages keep redirecting", () => {
  const expectedGuardCalls = new Map([
    ["app/api/deck-list/route.ts", 1],
    ["app/api/deck-selection-options/route.ts", 1],
    ["app/api/import-dialog-data/route.ts", 1],
    ["app/api/log-detail-body/route.ts", 1],
    ["app/api/log-detail-context/route.ts", 1],
    ["app/api/log-shares/route.ts", 2],
    ["app/api/performance-events/route.ts", 1],
    ["app/api/pokemon-options/route.ts", 1],
    ["app/api/stats-matchups/route.ts", 1],
    ["app/api/tournament-editor-data/route.ts", 1]
  ]);

  for (const [path, expectedCalls] of expectedGuardCalls) {
    const route = source(path);
    const guardCalls = route.match(/await requireApiUser\(\)/g) ?? [];

    assert.match(route, /from "@\/lib\/server\/api-auth"/);
    assert.doesNotMatch(route, /\brequireUser\b/);
    assert.equal(guardCalls.length, expectedCalls, `${path} should guard every handler`);
  }

  const apiAuth = source("lib/server/api-auth.ts");
  const pageAuth = source("lib/auth.ts");

  assert.match(apiAuth, /const user = await getCurrentUser\(\)/);
  assert.match(pageAuth, /export const requireUser = cache/);
  assert.match(pageAuth, /redirect\("\/login"\)/);
});
